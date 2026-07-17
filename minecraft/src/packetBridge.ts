import * as mc from '@minecraft/server';
import { EventEmitter } from 'eventemitter3';

export class PacketBridge extends EventEmitter<PacketBridgeEvents> {
	readonly unfinishedPacketsById: Map<string, Packet>;
	
	constructor() {
		super();
		this.unfinishedPacketsById = new Map();
	}

	getUnfinishedPacket(id: string): Packet | undefined {
		return this.unfinishedPacketsById.get(id);
	}

	getOrCreateUnfinishedPacket(id: string): Packet {
		let packet = this.getUnfinishedPacket(id);

		if(!packet) {
			packet = new Packet(id);
			this.unfinishedPacketsById.set(id, packet);
		}

		return packet;
	}

	finishPacket(id: string) {
		let packet = this.getUnfinishedPacket(id);
		if(packet) {
			packet.isFinished = true;
			packet.emit('finish', packet);
		}
		this.unfinishedPacketsById.delete(id);
	}

	chunk(rawData: string): Packet {
		let id = rawData.slice(0, 3);
		rawData = rawData.slice(3);

		let status = rawData.slice(0, 1);
		rawData = rawData.slice(1);

		let chunkData = rawData;

		if(id.length < 3 || status.length < 1 || !['d', 'e'].includes(status)) throw Error('Invalid chunk.');

		let packet = this.getOrCreateUnfinishedPacket(id);

		switch(status) {
			case 'd':
				packet.data += chunkData;
				break;
			case 'e':
				this.finishPacket(id);
				break;
		}

		return packet;
	}
}

export class Packet extends EventEmitter<PacketEvents> {
	readonly id: string;
	data: string;
	isFinished: boolean;

	constructor(id: string) {
		super();
		this.id = id;
		this.data = '';
		this.isFinished = false;
	}

	onFinish(callback: (packet: Packet) => void) {
		if(this.isFinished) {
			callback(this);
		} else {
			this.once('finish', callback);
		}
	}
}

export type PacketBridgeEvents = {
	message: (message: string) => void
}

export type PacketEvents = {
	finish: (packet: Packet) => void
}

export const packetBridge = new PacketBridge();

mc.system.afterEvents.scriptEventReceive.subscribe((event) => {
	if(event.id !== 'packet:chunk') return;
	packetBridge.chunk(event.message);
})