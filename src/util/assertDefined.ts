export function assertDefined<T>(
  val: T | null | undefined,
  msg?: string
): asserts val is T {
  if (val === null || val === undefined) {
    throw new Error(msg ?? "Assert value not to be undefined");
  }
}
