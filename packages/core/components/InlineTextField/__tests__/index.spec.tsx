import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { InlineTextField } from "../index";
import { resolveAndReplaceInlineData } from "../../../lib/data/resolve-and-replace-data";
import { reportFieldEdit } from "../../Puck/components/Fields/edit-alerts";

// useAppStoreApi reads from a Zustand-style API; we only need a getState() that
// returns the slice InlineTextField touches in its effect.
const makeAppStore = () => ({
  getState: () => ({
    state: {
      indexes: {
        nodes: {
          "comp-1": {
            data: { type: "MyBlock", props: { id: "comp-1" } },
          },
        },
      },
    },
    getComponentConfig: () => ({ fields: {} }),
  }),
});

jest.mock("../../../store", () => ({
  useAppStoreApi: () => makeAppStore(),
}));

jest.mock("../../../lib/overlay-portal", () => ({
  registerOverlayPortal: () => () => undefined,
}));

jest.mock("../../../lib/data/resolve-and-replace-data", () => ({
  resolveAndReplaceInlineData: jest.fn(),
}));
jest.mock("../../Puck/components/Fields/edit-alerts", () => ({ reportFieldEdit: jest.fn() }));

jest.mock("../styles.module.css");

describe("InlineTextField", () => {
  it("stops accepting input when the field becomes read-only while focused", () => {
    const props = {
      propPath: "subtitle",
      componentId: "comp-1",
      value: "Initial",
    };
    const { container, rerender } = render(
      <InlineTextField {...props} isReadOnly={false} />,
    );
    const span = container.querySelector("span")!;
    fireEvent.focus(span);
    expect(span).toHaveAttribute("contenteditable", "plaintext-only");

    rerender(<InlineTextField {...props} isReadOnly />);
    expect(span).toHaveAttribute("contenteditable", "false");
    fireEvent.input(span);
    expect(resolveAndReplaceInlineData).not.toHaveBeenCalled();
  });

  it("restores the committed value when an inline edit is canceled", async () => {
    jest.mocked(resolveAndReplaceInlineData).mockResolvedValueOnce(false);
    const { container } = render(
      <InlineTextField propPath="subtitle" componentId="comp-1" value="Initial" isReadOnly={false} />,
    );
    const span = container.querySelector("span")!;
    span.innerText = "draft";
    fireEvent.input(span);
    await waitFor(() => expect(span.textContent).toBe(""));
    expect(reportFieldEdit).toHaveBeenCalledWith(expect.anything(), {
      field: "subtitle", target: { kind: "item", id: "comp-1", type: "MyBlock" }, reason: "canceled",
    });
  });

  it("renders empty when value is null instead of the literal string 'null'", () => {
    const { container } = render(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value={null}
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.innerText ?? span?.textContent ?? "").toBe("");
  });

  it("renders empty when value is undefined instead of the literal string 'undefined'", () => {
    const { container } = render(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value={undefined}
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.innerText ?? span?.textContent ?? "").toBe("");
  });

  it("renders the placeholder as an attribute when value is empty", () => {
    const { container } = render(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value={""}
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    const span = container.querySelector("span");
    expect(span).not.toBeNull();
    expect(span?.innerText ?? span?.textContent ?? "").toBe("");
    expect(span).toHaveAttribute("data-placeholder", "Enter a subtitle");
  });

  it("renders the value when it is a non-empty string", () => {
    const { container } = render(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value="Hello world"
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    const span = container.querySelector("span");
    expect(span?.textContent).toBe("Hello world");
  });

  it("normalizes empty state and shows placeholder even when filler <br> is retained", () => {
    const { container, rerender } = render(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value="Initial"
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    const span = container.querySelector("span");
    expect(span).not.toBeNull();

    // Simulate browser retaining a <br> filler when field is emptied by user
    if (span) {
      span.innerHTML = "<br>";
    }

    // Re-render with empty value to trigger normalization
    rerender(
      <InlineTextField
        propPath="subtitle"
        componentId="comp-1"
        value=""
        isReadOnly={false}
        placeholder="Enter a subtitle"
      />,
    );

    // After normalization, the <br> should be removed and element should be empty
    expect(span?.innerHTML).toBe("");
    expect(span?.textContent ?? "").toBe("");
    // :empty pseudo-class should now match (though we can't directly test this,
    // the data-placeholder attribute presence confirms placeholder will render)
    expect(span).toHaveAttribute("data-placeholder", "Enter a subtitle");
  });
});
