import EventEmitter from 'events';
import { Server } from 'socket-be';

export class Mcwss extends EventEmitter<McbeWsServerEvents> {
	readonly host: string;
	readonly port: number;
	readonly server: Server;
	interval: NodeJS.Timeout | undefined;

	constructor(host: string, port: number) {
		super();
		this.host = host;
		this.port = port;
		this.server = new Server({
			port,
			webSocketOptions: { host }
		})
	}

	stop() {
		this.server.stop();
		if(this.interval) clearInterval(this.interval);
	}
}

export type McbeWsServerEvents = {
	start: [],
	stop: [],
	verifyMessages: [],
	message: [string]
}