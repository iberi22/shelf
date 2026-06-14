declare module 'events' {
	export class EventEmitter {
		on(eventName: string | symbol, listener: (...args: any[]) => void): this;
		off(eventName: string | symbol, listener: (...args: any[]) => void): this;
		emit(eventName: string | symbol, ...args: any[]): boolean;
	}
}
