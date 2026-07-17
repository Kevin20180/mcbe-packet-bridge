import EventEmitter from 'events';
import { Server } from 'socket-be';

export * from 'socket-be';

export class McPacketBridge extends EventEmitter<McPacketBridgeEvents> {
	readonly server: Server;
	interval: NodeJS.Timeout | undefined;
	packetIdIndex: number;

	constructor(server: Server) {
		super();
		this.server = server;
		this.packetIdIndex = 0;
	}

	stop() {
		this.server.stop();
		if(this.interval) clearInterval(this.interval);
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
		let packet = new Packet(this.makePacketId());

		if(data.length > 350) {
			while(data.length > 350) {
				packet.chunks.push(data.slice(0, 350));
				data = data.slice(350);
			}
			packet.chunks.push(data);
		} else {
			packet.chunks[0] = data;
		}

		return packet;
	}

	send(data: string) {
		const worlds = this.server.getWorlds();
		if(worlds.length === 0) return;

		let packet = this.createPacket(data);

		// enviar chunks
		for(const chunk of packet.chunks) {
			let cmd = `scriptevent packet:chunk ${packet.id}d${chunk}`;
			for(const world of worlds) {
				world.runCommand(cmd);
			}
		}

		// finalizar envio
		let cmd = `scriptevent packet:chunk ${packet.id}e`
		for(const world of worlds) {
			world.runCommand(cmd);
		}
	}
}

export class Packet {
	readonly id: string;
	chunks: string[];

	constructor(id: string) {
		this.id = id;
		this.chunks = [];
	}
}

export type McPacketBridgeEvents = {
	start: [],
	stop: [],
	verifyMessages: [],
	message: [string]
}