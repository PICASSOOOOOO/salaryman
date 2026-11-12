import { useCallback, useEffect, useState } from "react";
import { Delete, RotateCcw } from "lucide-react";

type Operator = "+" | "-" | "*" | "/" | null;
type CalculatorState = {
  display: string;
  stored: number | null;
  operator: Operator;
  startFresh: boolean;
  error: string;
};

const initialState: CalculatorState = { display: "0", stored: null, operator: null, startFresh: false, error: "" };
const keys = [
  { label: "AC", value: "clear", kind: "utility" },
  { label: "±", value: "sign", kind: "utility" },
  { label: "%", value: "percent", kind: "utility" },
  { label: "÷", value: "/", kind: "operator" },
  { label: "7", value: "7" }, { label: "8", value: "8" }, { label: "9", value: "9" }, { label: "×", value: "*", kind: "operator" },
  { label: "4", value: "4" }, { label: "5", value: "5" }, { label: "6", value: "6" }, { label: "−", value: "-", kind: "operator" },
  { label: "1", value: "1" }, { label: "2", value: "2" }, { label: "3", value: "3" }, { label: "+", value: "+", kind: "operator" },
  { label: "⌫", value: "backspace", kind: "utility" }, { label: "0", value: "0" }, { label: ".", value: ".", kind: "utility" }, { label: "=", value: "equals", kind: "equals" },
];

function parseDisplay(display: string): number | null {
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(display)) return null;
  const value = Number(display);
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Number(value.toPrecision(11));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export default function WorkspaceCalculator() {
  const [state, setState] = useState<CalculatorState>(initialState);

  const press = useCallback((key: string) => {
    setState((current) => {
      if (key === "clear") return initialState;
      if (current.error) return key === "backspace" ? initialState : key === "clear" ? initialState : current;

      if (/^\d$/.test(key)) {
        const display = current.startFresh || current.display === "0" ? key : current.display + key;
        if (display.replace("-", "").length > 15) return current;
        return { ...current, display, startFresh: false };
      }
      if (key === ".") {
        if (current.startFresh) return { ...current, display: "0.", startFresh: false };
        if (current.display.includes(".")) return current;
        return { ...current, display: `${current.display}.` };
      }
      if (key === "backspace") {
        if (current.startFresh) return { ...current, display: "0", startFresh: false };
        const shortened = current.display.length > 1 ? current.display.slice(0, -1) : "0";
        return { ...current, display: shortened === "-" ? "0" : shortened };
      }

      const value = parseDisplay(current.display);
      if (value === null) return { ...initialState, error: "Malformed number. Clear the calculator to continue." };

      if (key === "sign") {
        return { ...current, display: formatNumber(value * -1), startFresh: false };
      }
      if (key === "percent") {
        return { ...current, display: formatNumber(value / 100), startFresh: false };
      }
      if (key === "+" || key === "-" || key === "*" || key === "/") {
        if (current.operator && current.stored !== null && !current.startFresh) {
          if (current.operator === "/" && value === 0) {
            return { ...initialState, error: "Cannot divide by zero." };
          }
          const intermediate = calculate(current.stored, value, current.operator);
          return { ...current, stored: intermediate, display: formatNumber(intermediate), operator: key, startFresh: true };
        }
        return { ...current, stored: value, operator: key as Operator, startFresh: true };
      }
      if (key === "equals") {
        if (!current.operator || current.stored === null) return { ...current, startFresh: true };
        if (current.operator === "/" && value === 0) return { ...initialState, error: "Cannot divide by zero." };
        const result = calculate(current.stored, value, current.operator);
        return { display: formatNumber(result), stored: null, operator: null, startFresh: true, error: Number.isFinite(result) ? "" : "That calculation is outside the supported range." };
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if (/^\d$/.test(key) || ["+", "-", "*", "/", ".", "Enter", "=", "Escape", "Backspace", "%"].includes(key)) {
        event.preventDefault();
        press(key === "Enter" || key === "=" ? "equals" : key === "Escape" ? "clear" : key === "%" ? "percent" : key === "Backspace" ? "backspace" : key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const shown = state.error || state.display;

  return (
    <main className="min-h-[100dvh] bg-[#FAFAF7] px-3 py-5 text-[#11110f] sm:px-6 sm:py-8" data-testid="workspace-calculator">
      <div className="mx-auto max-w-md">
        <header className="mb-6 border-b border-[#d8d1c3] pb-5">
          <p className="font-mono text-xs font-bold tracking-[.16em] text-[#756d60]">WORKSPACE / TOOLS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Calculator</h1>
          <p className="mt-2 text-sm text-[#625c52]">A straightforward desk calculator. Keyboard-ready, no surprises.</p>
        </header>

        <section className="overflow-hidden rounded-lg border border-[#c9c1b3] bg-[#fffdf8] p-3 shadow-sm sm:p-5" aria-label="Calculator">
          <div className={`mb-3 flex min-h-28 flex-col items-end justify-end rounded-md border border-[#d8d1c3] bg-[#f1ede4] px-4 py-3 text-right ${state.error ? "text-[#8d3f32]" : ""}`} aria-live="polite" data-testid="calculator-display">
            <span className="mb-2 min-h-5 text-sm text-[#756d60]">{state.operator ? `${formatNumber(state.stored ?? 0)} ${state.operator === "*" ? "×" : state.operator === "/" ? "÷" : state.operator}` : " "}</span>
            <span className="max-w-full overflow-x-auto font-mono text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="calculator-value">{shown}</span>
          </div>
          {state.error && <p role="alert" className="mb-3 rounded-md border border-[#c98a70] bg-[#f8eee8] px-3 py-2 text-sm" data-testid="calculator-error">{state.error}</p>}
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Calculator keypad">
            {keys.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => press(item.value)}
                aria-label={item.value === "backspace" ? "Backspace" : item.value === "clear" ? "Clear" : item.label}
                className={`mobile-tap-target min-h-14 rounded-md border text-lg font-semibold transition-colors active:translate-y-px ${
                  item.kind === "operator" ? "border-[#c9c1b3] bg-[#eee8dc] hover:bg-[#e4dccd]" :
                  item.kind === "utility" ? "border-[#d8d1c3] bg-[#f7f3eb] text-[#625c52] hover:bg-[#eee8dc]" :
                  item.kind === "equals" ? "border-[#11110f] bg-[#11110f] text-[#fafaf7] hover:bg-[#34332f]" :
                  "border-[#e1dbd0] bg-[#fffdf8] hover:bg-[#f1ede4]"
                }`}
                data-testid={`calculator-key-${item.value}`}
              >
                {item.value === "backspace" ? <Delete className="mx-auto h-5 w-5" aria-hidden="true" /> : item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => press("clear")} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#d8d1c3] text-sm font-medium text-[#625c52] hover:bg-[#f1ede4]" data-testid="calculator-clear">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear all
          </button>
          <p className="mt-4 text-center text-xs text-[#756d60]">Keys: 0–9, +, −, *, /, %, . · Enter to calculate · Esc to clear</p>
        </section>
      </div>
    </main>
  );
}

function calculate(left: number, right: number, operator: Exclude<Operator, null>): number {
  switch (operator) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return right === 0 ? Number.NaN : left / right;
  }
}
