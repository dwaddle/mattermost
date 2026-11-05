export function testIdPart(testId: string | undefined, suffix: string): string | undefined {
    return testId ? `${testId}${suffix}` : undefined;
}
