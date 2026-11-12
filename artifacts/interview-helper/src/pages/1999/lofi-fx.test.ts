import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("1999 master lo-fi processor", () => {
  it("quantizes the wet signal and passes the original signal when bypassed", () => {
    const source = readFileSync(resolve(process.cwd(), "public/1999-lofi-processor.js"), "utf8");
    let Processor: any;
    runInNewContext(source, {
      AudioWorkletProcessor: class {
        port: { onmessage: ((event: { data: any }) => void) | null } = { onmessage: null };
      },
      sampleRate: 48_000,
      registerProcessor: (_name: string, processor: any) => { Processor = processor; },
    });

    const params = {
      enabled: true,
      input: 100,
      output: 100,
      mix: 100,
      filter: 50,
      bits: 4,
      rate: 48_000,
      drive: 0,
      alias: 100,
      noise: 0,
      drunk: 0,
      character: 0,
      bassBoost: false,
      bassFrequency: 120,
      stereoMode: "stereo",
    };
    const processor = new Processor({ processorOptions: { params } });
    const left = Float32Array.from([0.2, 0.6]);
    const right = Float32Array.from([-0.4, 0.9]);
    const outputLeft = new Float32Array(2);
    const outputRight = new Float32Array(2);
    processor.process([[left, right]], [[outputLeft, outputRight]]);
    expect(outputLeft[0]).toBeCloseTo(0.2, 5);
    expect(outputLeft[1]).toBeCloseTo(0.6, 5);
    expect(outputRight[0]).toBeCloseTo(-0.4, 5);
    expect(outputRight[1]).toBeCloseTo(13 / 15, 5);

    processor.port.onmessage?.({ data: { type: "params", params: { ...params, enabled: false } } });
    outputLeft.fill(0);
    outputRight.fill(0);
    processor.process([[left, right]], [[outputLeft, outputRight]]);
    expect([...outputLeft]).toEqual([...left]);
    expect([...outputRight]).toEqual([...right]);
  });
});
