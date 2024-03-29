import { hexy } from 'hexy';
import pickBy from 'lodash/pickBy';
import { Socket } from 'net';
import { BehaviorSubject, from, fromEvent, Subject, throwError } from 'rxjs';
import { filter, mapTo, take, timeout, catchError } from 'rxjs/operators';

import { FanSpeed, Limits, Mode, State, ConnectionState } from './_types';
import * as commands from './commands';
import { parseState, TheParser, TheParserResult } from './parsers';

const theParser = new TheParser();

const defaultState: State = {
  currentTemperature: 21,
  targetTemperature: 21,
  fanSpeed: FanSpeed.MIN,
  mode: Mode.FAN,
  health: false,
  limits: Limits.OFF,
  power: false,
};

type ConstructorOptions = {
  ip: string;
  mac: string;
  timeout?: number;
};

export class HaierAC {
  ip: string;
  port = 56800;
  mac: string;
  log: any;
  timeout: number;
  protected _rawData$ = new Subject<Buffer>();
  protected _client = new Socket();
  state$ = new BehaviorSubject<State>(defaultState);
  connectionState = new Subject<ConnectionState>();
  protected _seq = 0;

  constructor(options: ConstructorOptions, log) {
    const { ip, mac, timeout = 500 } = options;

    Object.assign(this, {
      ip,
      mac,
      timeout,
    });

    this.log = log;

    this._client.setTimeout(this.timeout);

    this._rawData$.subscribe((data) => {
      try {
        const resp = theParser.parse(data);
        const response = parseState(resp);
        if (!response) return;
        const { state } = response;

        if (state) {
          const keys = Object.keys(defaultState);
          const nextStateRaw = {
            ...this.state$.value,
            ...pickBy(state, (_, key) => keys.includes(key)),
          };

          this.state$.next(nextStateRaw);
        }
      } catch (error) {
        this.log(error.message);
      }
    });

    this._connect().catch((err) => {
      this.connectionState.next({error: err, connected:false});
    });

    this._client.on('data', (data) => {
      this._rawData$.next(data);
    });

    this._client.on('connect', () => {
      this.connectionState.next({connected:true});
    });

    this._client.on('close', (err) => {
      if (!err) {
        this._connect().catch((err) => {
           this.connectionState.next({error: err, connected:false});
        });
      }

      this.log('Connection closed', err);
    });

    this._client.on('error', (err) => {
      this.connectionState.next({error:err, connected:false})

      this.log(err);
    });

    // this.connectionState.subscribe(this.log);
    // this.state$.subscribe(this.log);
  }

  protected _connect() {
    return new Promise((resolve) => {
      this._client.connect(this.port, this.ip, () => resolve);
    }).catch(throwError)
  }

  hello() {
    return this._sendRequest((seq) => commands.hello(this.mac, seq));
  }

  protected init() {
    return this._sendRequest((seq) => commands.init(this.mac, seq));
  }

  on() {
    return this._sendRequest((seq) => commands.on(this.mac, seq));
  }

  off() {
    return this._sendRequest((seq) => commands.off(this.mac, seq));
  }

  async changeState(newState: Partial<Omit<State, 'power' | 'currentTemperature'>>) {
    if (!this.state$.value.power) {
      await this.on();
    }

    let { targetTemperature = 0 } = newState;
    if (targetTemperature < 16) {
      targetTemperature = 16;
    }

    if (targetTemperature > 30) {
      targetTemperature = 30;
    }

    targetTemperature = Math.round(targetTemperature);

    if (newState.targetTemperature) {
      newState.targetTemperature = targetTemperature;
    }

    return this._sendRequest((seq) =>
      commands.setState(
        this.mac,
        {
          ...this.state$.value,
          ...newState,
        },
        seq,
      ),
    );
  }

  protected _sendRequest(createCommand: (s: number) => Buffer) {
    const seq = this._seq;
    const cmd = createCommand(seq);

    const o$ = fromEvent(theParser, 'parseCompleted').pipe(
      filter<TheParserResult>((v) => v.seq === seq),
      take(1),
      mapTo(true as true),
      timeout(this.timeout),
    );

    this._seq = (this._seq + 1) % 256;
    this._client.write(cmd);

    return o$.toPromise().catch((error) => {
      this._connect().catch((err) => {
        this.connectionState.next({error: err, connected:false});
      });

      return false;
    });
  }
}
