import {
  Stagehand,
  localBrowser,
  browserbase,
  type Page,
  type StagehandBrowser as BrowserHandle,
  type LocalBrowserLaunchOptions,
  type BrowserbaseLaunchOptions,
} from "@browserbasehq/stagehand";
import {
  DEFAULT_VIEWPORT,
  type Confirm,
  type FunctionCall,
  type Viewport,
} from "./types.js";
import { observe } from "./observation.js";
import { respond } from "./response.js";

export type BrowserOptions = {
  allowedDomains?: string[];
  blockedDomains?: string[];
  viewport?: Viewport;
};
export type LaunchOptions = Omit<
  LocalBrowserLaunchOptions,
  "viewport" | "executablePath"
> &
  BrowserOptions & { chromePath?: string };
export type HostedOptions = BrowserbaseLaunchOptions & BrowserOptions;

function viewportSize(
  viewport: Viewport = DEFAULT_VIEWPORT,
): Readonly<Viewport> {
  if (
    ![viewport.width, viewport.height].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new TypeError("Viewport dimensions must be positive integers");
  return Object.freeze({ ...viewport });
}

export class StagehandBrowser {
  private constructor(
    private readonly handle: BrowserHandle,
    readonly page: Page,
    readonly viewport: Readonly<Viewport>,
  ) {}

  static async launch(options: LaunchOptions = {}): Promise<StagehandBrowser> {
    const { allowedDomains, blockedDomains, viewport, chromePath, ...launch } =
      options;
    const size = viewportSize(viewport);
    const handle = await localBrowser.launch({
      ...launch,
      ...(chromePath && { executablePath: chromePath }),
      viewport: size,
    });
    return this.attach(handle, { allowedDomains, blockedDomains }, size);
  }

  static async browserbase(options: HostedOptions): Promise<StagehandBrowser> {
    const { allowedDomains, blockedDomains, viewport, ...launch } = options;
    const size = viewportSize(viewport);
    const handle = await browserbase.launch(launch);
    return this.attach(handle, { allowedDomains, blockedDomains }, size);
  }

  private static async attach(
    handle: BrowserHandle,
    policy: Omit<BrowserOptions, "viewport">,
    viewport: Readonly<Viewport>,
  ): Promise<StagehandBrowser> {
    try {
      await Stagehand.create({ browser: handle });
      await handle.context.setDomainPolicy({
        ...(policy.allowedDomains !== undefined && {
          allowedDomains: policy.allowedDomains,
        }),
        ...(policy.blockedDomains !== undefined && {
          blockedDomains: policy.blockedDomains,
        }),
      });
      const page = await handle.context.newPage();
      await page.setViewportSize(viewport.width, viewport.height);
      return new StagehandBrowser(handle, page, viewport);
    } catch (cause) {
      try {
        await handle.close();
      } catch (cleanup) {
        throw new AggregateError(
          [cause, cleanup],
          "Browser initialization and cleanup failed",
        );
      }
      throw cause;
    }
  }

  get closed(): boolean {
    return this.handle.closed;
  }

  private assertOpen(): void {
    if (this.handle.closed)
      throw new Error("Browser is closed or disconnected");
  }

  async observe() {
    this.assertOpen();
    return observe(this.page);
  }

  async respond(call: FunctionCall, confirm?: Confirm) {
    this.assertOpen();
    return respond(this.page, call, confirm, this.viewport);
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}
