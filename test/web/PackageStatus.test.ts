const formatStatusLabel = (recipient: string, seconds?: number | null) => {
  if (!recipient) return "";
  let label = `📦: ${recipient}`;
  if (typeof seconds === "number" && seconds > 0) {
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    label += ` ${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
  }
  return label;
};

describe("PackageStatus UI label", () => {
  test("formats recipient and time when seconds provided", () => {
    expect(formatStatusLabel("Bob", 70)).toBe("📦: Bob 1:10");
  });

  test("formats recipient without time when seconds omitted", () => {
    expect(formatStatusLabel("Alice")).toBe("📦: Alice");
  });
});
