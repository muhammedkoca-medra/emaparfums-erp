import { describe, expect, it } from "vitest";
import { forecastNextMonth, movingAverage } from "./forecast.js";

describe("talep tahmini (F5-07, PNL-04)", () => {
  it("movingAverage son penceredeki ortalamayı verir", () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toBe(3);
    expect(movingAverage([], 3)).toBe(0);
  });

  it("forecastNextMonth eğilimi belirler", () => {
    expect(forecastNextMonth([10, 20, 30]).trend).toBe("up");
    expect(forecastNextMonth([30, 20, 10]).trend).toBe("down");
    expect(forecastNextMonth([20, 20, 20])).toEqual({ forecast: 20, trend: "flat" });
  });
});
