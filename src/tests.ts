import { setegid } from 'process';
import { McPacketBridge, Server, ServerEvent } from './index.js';

const server = new Server({
	webSocketOptions: { host: '0.0.0.0' },
	port: 3000
})

const packetBridge = new McPacketBridge(server);

server.on(ServerEvent.WorldInitialize, (event) => {
	console.log('Novo mundo conectado.');
	packetBridge.send('a'.repeat(500), event.world);
})

packetBridge.on('message', (message) => {
	console.log(`Mensagem tamanho ${message.length}: ${message}`);
})

setInterval(async () => {
	for(const world of server.getWorlds()) {
		try { await packetBridge.readAndReceivePackets(world) }
		catch {}
	}
}, 50)