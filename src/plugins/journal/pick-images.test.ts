import { launchImageLibraryAsync } from "expo-image-picker";

import { pickImages } from "./pick-images";

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
const launch = launchImageLibraryAsync as jest.MockedFunction<typeof launchImageLibraryAsync>;

beforeEach(() => launch.mockReset());

describe("pickImages", () => {
  it("opens the library for several images up to the limit and returns their uris", async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///a.jpg" }, { uri: "file:///b.jpg" }],
    } as Awaited<ReturnType<typeof launchImageLibraryAsync>>);

    await expect(pickImages(3)).resolves.toEqual(["file:///a.jpg", "file:///b.jpg"]);
    expect(launch).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 1,
    });
  });

  it("returns [] on cancel", async () => {
    launch.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickImages(3)).resolves.toEqual([]);
  });

  it("never returns more than the limit", async () => {
    launch.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///a.jpg" }, { uri: "file:///b.jpg" }],
    } as Awaited<ReturnType<typeof launchImageLibraryAsync>>);
    await expect(pickImages(1)).resolves.toEqual(["file:///a.jpg"]);
  });

  it("does not open the picker when no more photos fit", async () => {
    await expect(pickImages(0)).resolves.toEqual([]);
    expect(launch).not.toHaveBeenCalled();
  });
});
