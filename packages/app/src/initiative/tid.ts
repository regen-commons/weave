/** The base-32 alphabet AT Protocol timestamp identifiers use, in sort order. */
const SORTABLE = "234567abcdefghijklmnopqrstuvwxyz";
/** A timestamp identifier as Certified and the support listings accept it. */
export const TID = /^[2-7a-j][2-7a-z]{12}$/u;

/**
 * A new AT Protocol timestamp identifier (TID): microseconds since 1970 in the top 53 bits and a random
 * 10-bit clock identifier, written as 13 sortable base-32 characters. Weave picks a record's key before
 * it asks Certified to create the record, and keeps it, so a retried creation names the same record and
 * can never make a second one.
 */
export function newTid(now: number = Date.now(), random: () => number = Math.random): string {
  const micros = BigInt(Math.floor(now)) * 1000n + BigInt(Math.floor(random() * 1000));
  let value = (micros << 10n) | BigInt(Math.floor(random() * 1024) & 1023);
  let text = "";
  for (let index = 0; index < 13; index++) {
    text = SORTABLE[Number(value & 31n)] + text;
    value >>= 5n;
  }
  return text;
}
