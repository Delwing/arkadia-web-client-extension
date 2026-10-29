import { Overlays } from "./Overlays";
import { Shell, type ShellProps } from "./shell/Shell";

/** The wiring that still lives in main.ts, handed to the parts that need it. */
export type AppProps = ShellProps;

/** The stock UI: the page itself, and what floats over it. */
export function App(props: AppProps) {
    return (
        <>
            <Shell {...props} />
            <Overlays />
        </>
    );
}
