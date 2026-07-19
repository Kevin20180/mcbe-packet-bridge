import * as mc from '@minecraft/server';
import { EventEmitter } from 'eventemitter3';

export class PacketBridge extends EventEmitter<PacketBridgeEvents> {
	packetIdIndex: number;
	receivingPacketsById: Map<string, Packet>;
	sendingPacketsById: Map<string, Packet>;
	sendingPacketRawChunks: string[];
	
	constructor() {
		super();
		this.packetIdIndex = 0;
		this.receivingPacketsById = new Map();
		this.sendingPacketsById = new Map();
		this.sendingPacketRawChunks = [];
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

	receiveChunkPacket(rawData: string): Packet {
		let id = rawData.slice(0, 3);
		rawData = rawData.slice(3);

		let status = rawData.slice(0, 1);
		rawData = rawData.slice(1);

		let chunkData = rawData;

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

	getPacketBeingSend(id: string): Packet | undefined {
		return this.sendingPacketsById.get(id);
	}

	getOrCreatePacketBeingSend(id: string): Packet {
		let packet = this.getPacketBeingSend(id);

		if(!packet) {
			packet = new Packet(this, id);
			packet.isSending = true;
			this.sendingPacketsById.set(id, packet);
		}

		return packet;
	}

	send(message: string) {
		let packet = this.getOrCreatePacketBeingSend(this.makePacketId());
		packet.data = message;

		for(let chunk of packet.getRawChunks()) {
			this.sendingPacketRawChunks.push(chunk);
		}
		this.sendingPacketRawChunks.push(`${packet.id}e`);
	}
}

export class Packet extends EventEmitter<PacketEvents> {
	readonly bridge: PacketBridge;
	readonly id: string;
	data: string;
	isSending: boolean;
	isReceiving: boolean;

	constructor(bridge: PacketBridge, id: string) {
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

export type PacketBridgeEvents = {
	message: (message: string, packet: Packet) => void
}

export type PacketEvents = {
	finishSend: (packet: Packet) => void,
	finishReceive: (packet: Packet) => void
}

export const packetBridge = new PacketBridge();

mc.system.beforeEvents.startup.subscribe((event) => {
	const { customCommandRegistry } = event;

	customCommandRegistry.registerCommand({
		name: 'packet:get_packet',
		description: 'get_packet',
		cheatsRequired: true,
		permissionLevel: mc.CommandPermissionLevel.GameDirectors
	}, () => {
		let res = {
			status: mc.CustomCommandStatus.Success,
			message: packetBridge.sendingPacketRawChunks[0] || ''
		}
		packetBridge.sendingPacketRawChunks = packetBridge.sendingPacketRawChunks.slice(1);

		return res;
	})
})

mc.system.afterEvents.scriptEventReceive.subscribe((event) => {
	if(event.id !== 'packet:chunk') return;
	packetBridge.receiveChunkPacket(event.message);
})

packetBridge.on('message', (message) => {
	mc.world.sendMessage(`Mensagem tamanho ${message.length}: ${message}`);
})