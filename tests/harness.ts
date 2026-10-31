import GLib from 'gi://GLib';

/**
 * Minimal test harness for GJS: no dependencies, runs every registered test in
 * order on the GLib main loop, prints one line per test and reports failures
 * through the process exit code.
 */

type TestFn = () => void | Promise<void>;

interface TestCase {
    suite: string;
    name: string;
    fn: TestFn;
}

const cases: TestCase[] = [];
const afterEachHooks: TestFn[] = [];
let currentSuite = '';

export function describe(suite: string, body: () => void): void {
    const previous = currentSuite;
    currentSuite = suite;
    body();
    currentSuite = previous;
}

export function test(name: string, fn: TestFn): void {
    cases.push({ suite: currentSuite, name, fn });
}

export function afterEach(fn: TestFn): void {
    afterEachHooks.push(fn);
}

export class AssertionError extends Error {}

function show(value: unknown): string {
    return JSON.stringify(value, (_key, v: unknown) => (v instanceof Uint8Array ? Array.from(v) : v));
}

export function assert(condition: unknown, message = 'expected condition to be true'): asserts condition {
    if (!condition)
        throw new AssertionError(message);
}

export function assertEqual<T>(actual: T, expected: T, message = ''): void {
    if (!Object.is(actual, expected))
        throw new AssertionError(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
}

export function assertDeepEqual(actual: unknown, expected: unknown, message = ''): void {
    if (show(actual) !== show(expected))
        throw new AssertionError(`${message ? `${message}: ` : ''}expected ${show(expected)}, got ${show(actual)}`);
}

/** Resolves after `ms` milliseconds of main-loop time. */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

/** Polls `predicate` until it holds, failing after `timeoutMs`. */
export async function waitFor(predicate: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline)
            throw new AssertionError(`timed out waiting for ${what}`);
        await sleep(10);
    }
}

/** Runs every registered test; returns the number of failures. */
export async function run(): Promise<number> {
    let failures = 0;
    for (const { suite, name, fn } of cases) {
        const label = suite ? `${suite} › ${name}` : name;
        try {
            await fn();
            print(`ok   ${label}`);
        } catch (error) {
            failures++;
            print(`FAIL ${label}\n     ${error instanceof Error ? error.message : String(error)}`);
            if (!(error instanceof AssertionError) && error instanceof Error && error.stack)
                print(error.stack.replace(/^/gm, '     '));
        }
        for (const hook of afterEachHooks)
            await hook();
    }
    print(`\n${cases.length - failures}/${cases.length} passed`);
    return failures;
}
