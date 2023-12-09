import UDP from 'dgram';
import { Driver, DiscoveryResultMAC } from 'homey';

class HaierACDriver extends Driver {

  async onInit() {
    const discovery = UDP.createSocket('udp4');
    discovery.bind(7083);

    discovery.on('message', (msg: Buffer, rinfo: UDP.RemoteInfo) => {
      this.log('Broadcast received %d bytes from %s:%d',msg.length, rinfo.address, rinfo.port);

      //send echo
      discovery.send(msg, 0, msg.length, rinfo.port, rinfo.address);
    });
  }

  async onPairListDevices() {
    const discoveryStrategy = this.getDiscoveryStrategy();

    const discoveryResults = discoveryStrategy.getDiscoveryResults();

    const devices = Object.values(discoveryResults).map((discoveryResult: DiscoveryResultMAC) => {
      return {
        name: "Haier AC",
        data: {
          id: discoveryResult.id,
          mac: discoveryResult.mac,
          address: discoveryResult.address,
          lastSeen: discoveryResult.lastSeen,
        },
      };
    });

    return devices;
  }
}

module.exports = HaierACDriver;
