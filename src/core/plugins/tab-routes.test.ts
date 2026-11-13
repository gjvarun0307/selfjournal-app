import fs from "fs";
import path from "path";

import { TAB_ROUTES } from "./tab-routes";

describe("TAB_ROUTES", () => {
  it("every tab route has a file in src/app/(tabs)", () => {
    for (const r of TAB_ROUTES) {
      expect(fs.existsSync(path.join(__dirname, "../../app/(tabs)", `${r}.tsx`))).toBe(true);
    }
  });
});
