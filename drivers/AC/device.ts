import { Device, DiscoveryResultMAC } from 'homey';
import { HaierAC, Mode } from '../../lib/haier-ac-remote';

class HaierACDevice extends Device {

  _haierACDevice: HaierAC | null = null;
  _state: any | null = null;
  _helloTimer: any | null = null;

  onDiscoveryResult(discoveryResult: DiscoveryResultMAC) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMAC) {
    this.log("Haier AC is available", `MAC=${discoveryResult.mac} IP Address=${discoveryResult.address}`);

    this._haierACDevice = new HaierAC({
      ip: discoveryResult.address,
      mac: discoveryResult.mac,
      timeout: 15000
    }); 

    this._haierACDevice.connectionState.subscribe(state => {
      this.log("Haier AC connection state", state);
      if (state.error != null && this.getAvailable()) {
        this.setUnavailable(state.error.message);
        return;
      }

      if (state.connected && !this.getAvailable()) {
        this.setAvailable();
      }
    });

    this._haierACDevice.state$.subscribe(data => {
      this._state = data;
      this._setCapabilities();
    });

    this._setCapabilityListeners();

    this._startHelloTimer();
  }

  async onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMAC) {
    this.log("Haier AC address changed", `MAC=${discoveryResult.mac} IP Address=${discoveryResult.address}`);

    this._haierACDevice.ip = discoveryResult.address;
    this._haierACDevice.mac = discoveryResult.mac;
  }

  _getCurrentTemperature() {
    return this._state.currentTemperature;
  }

  _getTargetTemperature() {
    return this._state.targetTemperature;
  }

  _getPowerState() {
    return this._state.power;
  }

  _getMode() {
    if (this._state.power === false) {
      return 'off';
    }

    switch(this._state.mode) {
      case Mode.COOL:
        return 'cool';
      case Mode.HEAT:
        return 'heat';
      case Mode.SMART:
        return 'auto';
      default:
        return 'off';
    }
  }

  _getFanSpeed() {
    return this._state.fanSpeed.toString();
  }

  _getHealthMode() {
    return this._state.health;
  }

  _setCapabilities() {
    if (this.hasCapability("measure_temperature") && this._getCurrentTemperature() != null) {
      this.setCapabilityValue("measure_temperature", this._getCurrentTemperature());
    }
    if (this.hasCapability("target_temperature") && this._getTargetTemperature() != null) {
      this.setCapabilityValue("target_temperature", this._getTargetTemperature());
    }

    if (this.hasCapability("onoff") && this._getPowerState() != null) {
      this.setCapabilityValue("onoff", this._getPowerState());
    }

    if (this.hasCapability("thermostat_mode")) {
       this.setCapabilityValue("thermostat_mode", this._getMode());
    }

    if (this.hasCapability("fan_speed_mode")) {
      this.setCapabilityValue("fan_speed_mode", this._getFanSpeed());
    }

    if (this.hasCapability("health_mode")) {
      this.setCapabilityValue("health_mode", this._getHealthMode());
    }
  }

  _setCapabilityListeners() {
    this.registerCapabilityListener("target_temperature", async (value) => {
      await this._haierACDevice.changeState({
        targetTemperature: value,
      });
    });

    this.registerCapabilityListener("onoff", async (value) => {
      if (value == true) {
        await this._haierACDevice.on();
      } else {
        await this._haierACDevice.off();
      }
    });

    this.registerCapabilityListener("thermostat_mode", async (value) => {
      switch (value) {
        case 'auto':
          await this._haierACDevice.changeState({
            mode: Mode.SMART,
          });
          break;
        case 'heat':
          await this._haierACDevice.changeState({
            mode: Mode.HEAT,
          });
          break;
        case 'cool':
          await this._haierACDevice.changeState({
            mode: Mode.COOL,
          });
          break;
        default:
          await this._haierACDevice.off();
      }
    });
  
    this.registerCapabilityListener("fan_speed_mode", async (value) => {
      await this._haierACDevice.changeState({
        fanSpeed: parseInt(value),
      });
    });

    this.registerCapabilityListener("health_mode", async (value) => {
      await this._haierACDevice.changeState({
        health: value,
      });
    });
  }
  _startHelloTimer() {
    this._helloTimer = setInterval(async () => {
      this._haierACDevice.hello();
    }, 15 * 1000);
  }

}

module.exports = HaierACDevice;
