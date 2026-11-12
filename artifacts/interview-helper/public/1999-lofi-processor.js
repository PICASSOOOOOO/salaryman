class Salaryman1999LofiProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.params = options.processorOptions?.params || {};
    this.frame = 0;
    this.ratePhase = 1;
    this.lowState = [0, 0];
    this.bassState = [0, 0];
    this.aliasState = [0, 0];
    this.held = [0, 0];
    this.noiseSeed = 0x1999;
    this.delayLength = Math.ceil(sampleRate * 0.06) + 2;
    this.delayLines = [new Float32Array(this.delayLength), new Float32Array(this.delayLength)];
    this.delayWrite = 0;
    this.port.onmessage = event => {
      if (event.data?.type === "params" && event.data.params) {
        this.params = event.data.params;
      }
    };
  }

  nextNoise() {
    let value = this.noiseSeed | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.noiseSeed = value | 0;
    return (value >>> 0) / 4294967295 * 2 - 1;
  }

  process(inputs, outputs) {
    const input = inputs[0] || [];
    const output = outputs[0] || [];
    if (!output.length) return true;
    const frames = output[0].length;
    const params = this.params;
    const leftInput = input[0];
    const rightInput = input[1] || leftInput;

    if (!params.enabled) {
      for (let channel = 0; channel < output.length; channel += 1) {
        const source = input[Math.min(channel, input.length - 1)];
        if (source) output[channel].set(source);
        else output[channel].fill(0);
      }
      return true;
    }

    const inputGain = Math.max(0, Math.min(1.5, Number(params.input) / 100));
    const outputGain = Math.max(0, Math.min(1.5, Number(params.output) / 100));
    const mix = Math.max(0, Math.min(1, Number(params.mix) / 100));
    const bits = Math.max(4, Math.min(16, Number(params.bits) || 16));
    const levels = Math.pow(2, bits) - 1;
    const sampleRateLimit = Math.max(4_000, Math.min(48_000, Number(params.rate) || 48_000));
    const sampleAdvance = sampleRateLimit / sampleRate;
    const rateReduction = sampleRateLimit < sampleRate - 1;
    const filter = Math.max(0, Math.min(100, Number(params.filter) || 0));
    const alias = Math.max(0, Math.min(100, Number(params.alias) || 0));
    const character = Math.max(0, Math.min(100, Number(params.character) || 0)) / 100;
    const drive = Math.max(0, Math.min(100, Number(params.drive) || 0)) / 100;
    const noise = Math.max(0, Math.min(100, Number(params.noise) || 0)) / 100;
    const drunk = Math.max(0, Math.min(100, Number(params.drunk) || 0)) / 100;
    const bassBoost = !!params.bassBoost;
    const bassFrequency = Math.max(20, Math.min(500, Number(params.bassFrequency) || 120));
    const mono = params.stereoMode === "mono" || output.length === 1;

    for (let frame = 0; frame < frames; frame += 1) {
      const left = leftInput ? leftInput[frame] : 0;
      const right = rightInput ? rightInput[frame] : left;
      const monoInput = (left + right) * 0.5;
      this.ratePhase += sampleAdvance;
      let updateHeld = false;
      while (this.ratePhase >= 1) {
        this.ratePhase -= 1;
        updateHeld = true;
      }

      for (let channel = 0; channel < output.length; channel += 1) {
        const sourceValue = mono ? monoInput : channel === 0 ? left : right;
        const dry = sourceValue * inputGain;
        let signal = dry;

        if (drunk > 0) {
          const line = this.delayLines[channel] || this.delayLines[0];
          line[this.delayWrite] = signal;
          const wobble = Math.sin((this.frame + frame) * 0.00072) * drunk * sampleRate * 0.008;
          const delaySamples = Math.max(1, Math.min(this.delayLength - 2, drunk * sampleRate * 0.016 + wobble));
          let read = this.delayWrite - delaySamples;
          if (read < 0) read += this.delayLength;
          const base = Math.floor(read);
          const fraction = read - base;
          const next = (base + 1) % this.delayLength;
          signal = line[base] * (1 - fraction) + line[next] * fraction;
        }

        if (bassBoost) {
          const bassAlpha = 1 - Math.exp(-2 * Math.PI * bassFrequency / sampleRate);
          this.bassState[channel] += bassAlpha * (signal - this.bassState[channel]);
          signal += this.bassState[channel] * 0.55;
        }

        const lowCutoff = 500 + (filter / 50) * 19_500;
        const alpha = 1 - Math.exp(-2 * Math.PI * Math.min(20_000, lowCutoff) / sampleRate);
        this.lowState[channel] += alpha * (signal - this.lowState[channel]);
        if (filter < 50) signal = this.lowState[channel];
        else if (filter > 50) signal = signal - this.lowState[channel] * ((filter - 50) / 50) * 0.8;

        if (updateHeld) this.held[channel] = signal;
        const antiAliasAlpha = rateReduction ? 0.06 + alias * 0.0094 : 1;
        this.aliasState[channel] += antiAliasAlpha * (this.held[channel] - this.aliasState[channel]);
        signal = this.aliasState[channel];
        signal = Math.round(Math.max(-1, Math.min(1, signal)) * levels) / levels;

        const saturation = drive * 7 + character * 2;
        if (saturation > 0) {
          const amount = 1 + saturation;
          signal = Math.tanh(signal * amount) / Math.tanh(amount);
        }
        signal += this.nextNoise() * noise * 0.035;
        const processed = (dry * (1 - mix) + signal * mix) * outputGain;
        output[channel][frame] = mono ? (channel === 0 ? processed : output[0][frame]) : processed;
      }
      this.delayWrite = (this.delayWrite + 1) % this.delayLength;
    }
    this.frame += frames;
    return true;
  }
}

registerProcessor("salaryman-1999-lofi", Salaryman1999LofiProcessor);
