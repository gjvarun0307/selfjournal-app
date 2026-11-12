import { EventBus } from "./bus";

declare module "@/core/events/types" {
  interface AppEvents {
    "test.ping": { n: number };
  }
}

describe("EventBus", () => {
  it("delivers payload to every subscriber", async () => {
    const bus = new EventBus({ onError: jest.fn() });
    const a: number[] = [];
    const b: number[] = [];
    bus.on("test.ping", (p) => { a.push(p.n); });
    bus.on("test.ping", async (p) => { b.push(p.n); });
    await bus.emit("test.ping", { n: 1 });
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it("unsubscribe stops delivery", async () => {
    const bus = new EventBus({ onError: jest.fn() });
    const got: number[] = [];
    const off = bus.on("test.ping", (p) => { got.push(p.n); });
    await bus.emit("test.ping", { n: 1 });
    off();
    await bus.emit("test.ping", { n: 2 });
    expect(got).toEqual([1]);
  });

  it("unsubscribing during emit does not break iteration", async () => {
    const bus = new EventBus({ onError: jest.fn() });
    const got: string[] = [];
    let offB = () => {};
    bus.on("test.ping", () => { got.push("a"); offB(); });
    offB = bus.on("test.ping", () => { got.push("b"); });
    bus.on("test.ping", () => { got.push("c"); });
    await bus.emit("test.ping", { n: 1 });
    expect(got).toContain("a");
    expect(got).toContain("c");
  });

  it("a throwing handler does not block others or reject emit", async () => {
    const onError = jest.fn();
    const bus = new EventBus({ onError });
    const got: number[] = [];
    bus.on("test.ping", () => { throw new Error("sync"); });
    bus.on("test.ping", async () => { throw new Error("async"); });
    bus.on("test.ping", (p) => { got.push(p.n); });
    await expect(bus.emit("test.ping", { n: 7 })).resolves.toBeUndefined();
    expect(got).toEqual([7]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "test.ping");
  });
});
