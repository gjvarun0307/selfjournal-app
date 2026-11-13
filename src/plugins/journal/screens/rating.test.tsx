import { fireEvent, render, screen } from "@testing-library/react-native";

import { Rating } from "./rating";

type Json = { props: Record<string, unknown>; children: (Json | string)[] | null };

function countAccessible(node: unknown): number {
  if (!node || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + countAccessible(c), 0);
  const j = node as Json;
  return (j.props.accessible === true ? 1 : 0) + countAccessible(j.children);
}

describe("Rating", () => {
  it("read-only: one accessible image with the value, stars not separately reachable", async () => {
    await render(<Rating value={4} />);
    const el = screen.getByLabelText("4 of 5 stars");
    expect(el.props.accessibilityRole).toBe("image");
    expect(screen.queryByLabelText(/^Rate /)).toBeNull();
    expect(countAccessible(screen.toJSON())).toBe(1);
  });

  it("interactive: five rate buttons, the current one selected", async () => {
    const onChange = jest.fn();
    await render(<Rating value={2} onChange={onChange} />);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(screen.getByLabelText("Rate 2 of 5").props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByLabelText("Rate 5 of 5"));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});
