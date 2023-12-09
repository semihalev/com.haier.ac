import Homey from "homey";

class HaierACApp extends Homey.App {

  async onInit() {    
    this.log('Haier AC App has been initialized!');
  }
}

module.exports = HaierACApp;
