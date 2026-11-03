import { describe, expect, it } from "vitest";
import { topicResolver } from "../server/study";

const topics = [
  { id: "cell-theory", name: "Cell Theory" },
  { id: "transport-across-membranes", name: "Transport Across Membranes" },
  { id: "the-cell-cycle", name: "The Cell Cycle" },
];

describe("topicResolver", () => {
  const resolve = topicResolver(topics);
  it("accepts ids, names, and near-misses", () => {
    expect(resolve("cell-theory")).toBe("cell-theory");
    expect(resolve("Cell Theory")).toBe("cell-theory");
    expect(resolve("CELL_THEORY")).toBe("cell-theory");
    expect(resolve("transport across membranes")).toBe("transport-across-membranes");
    expect(resolve("Membranes")).toBe("transport-across-membranes");
  });
  it("rejects ambiguous or unknown topics", () => {
    expect(resolve("Cell")).toBeNull(); // matches more than one
    expect(resolve("Photosynthesis")).toBeNull();
  });
  it("uses the only topic when there is just one", () => {
    expect(topicResolver([topics[0]])("anything")).toBe("cell-theory");
  });
});
