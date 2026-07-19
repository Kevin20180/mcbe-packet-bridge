import EventEmitter from 'events';
import { Server, World } from 'socket-be';

export * from 'socket-be';

export class McPacketBridge extends EventEmitter<McPacketBridgeEvents> {
	readonly server: Server;
	packetIdIndex: number;
	readonly receivingPacketsById: Map<string, Packet>;
	readonly sendingPacketsById: Map<string, Packet>;

	constructor(server: Server) {
		super();
		this.server = server;
		this.packetIdIndex = 0;
		this.receivingPacketsById = new Map();
		this.sendingPacketsById = new Map();
	}

	makePacketId(): string {
		let id = this.packetIdIndex.toString();

		this.packetIdIndex++;
		if(this.packetIdIndex > 999) this.packetIdIndex = 0;

		while(id.length < 3) {
			id = '0' + id;
		}

		return id;
	}

	createPacket(data: string): Packet {
		let packet = new Packet(this, this.makePacketId());
		packet.data = data;
		return packet;
	}

	getPacketBeingReceived(id: string): Packet | undefined {
		return this.receivingPacketsById.get(id);
	}

	getOrCreatePacketBeingReceived(id: string): Packet {
		let packet = this.getPacketBeingReceived(id);

		if(!packet) {
			packet = new Packet(this, id);
			packet.isReceiving = true;
			this.receivingPacketsById.set(id, packet);
		}

		return packet;
	}

	receiveChunkPacket(chunkRawData: string): Packet {
		let id = chunkRawData.slice(0, 3);
		chunkRawData = chunkRawData.slice(3);

		let status = chunkRawData.slice(0, 1);
		chunkRawData = chunkRawData.slice(1);

		let chunkData = chunkRawData;

		if(id.length < 3 || status.length < 1 || !['d', 'e'].includes(status)) throw Error('Invalid chunk.');

		let packet = this.getOrCreatePacketBeingReceived(id);

		switch(status) {
			case 'd':
				packet.data += chunkData;
				break;
			case 'e':
				packet.finishReceive();
				break;
		}

		return packet;
	}

	async readAndReceivePackets(world: World): Promise<Packet[]> {
		let res = await world.runCommand('get_packet');

		let chunkRawData = res.statusMessage;
		if(chunkRawData.length === 0) return [];

		return [ this.receiveChunkPacket(chunkRawData) ];
	}

	async sendPacketChunk(packetId: string, chunkData: string, world: World) {
		await world.runCommand(`scriptevent packet:chunk ${chunkData}`);
	}

	async send(message: string, world: World) {
		const packet = this.createPacket(message);
		packet.isSending = true;

		for(let chunk of packet.getRawChunks()) {
			await this.sendPacketChunk(packet.id, chunk, world);
		}
		await world.runCommand(`scriptevent packet:chunk ${packet.id}e`);

		packet.finishSend();
	}
}

export class Packet extends EventEmitter<PacketEvents> {
	readonly bridge: McPacketBridge;
	readonly id: string;
	data: string;
	isSending: boolean;
	isReceiving: boolean;

	constructor(bridge: McPacketBridge, id: string) {
		super();
		this.bridge = bridge;
		this.id = id;
		this.data = '';
		this.isSending = false;
		this.isReceiving = false;
	}

	getRawChunks(): string[] {
		let chunks: string[] = [];
		let data = this.data;

		while(data.length > 350) {
			chunks.push(`${this.id}d${data.slice(0, 350)}`);
			data = data.slice(350);
		}
		chunks.push(`${this.id}d${data.slice(0, 350)}`);

		return chunks;
	}

	finishSend() {
		if(!this.isSending) return;
		this.isSending = false;
		this.bridge.sendingPacketsById.delete(this.id);
		this.emit('finishSend', this);
	}

	finishReceive() {
		if(!this.isReceiving) return;
		this.isReceiving = false;
		this.bridge.receivingPacketsById.delete(this.id);
		this.emit('finishReceive', this);
		this.bridge.emit('message', this.data, this);
	}
}

export type McPacketBridgeEvents = {
	message: [string, Packet]
}

export type PacketEvents = {
	finishSend: [Packet],
	finishReceive: [Packet]
}