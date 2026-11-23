// Writes the fonts a record's picture is drawn with (src/record-image.ts) from the design system's own
// files. The picture's renderer reads TrueType, not WOFF2, and draws a variable font at its default
// instance, so this keeps each font's default instance only: macOS's CoreText decodes the WOFF2, and its
// tables, without the ones that vary it, are written as a TrueType file.
//
// Run on macOS from the repository's root after a font in packages/design-system/fonts changes:
//   swift packages/api/scripts/record-image-fonts.swift
import CoreText
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = root.appendingPathComponent("packages/design-system/fonts")
let target = root.appendingPathComponent("packages/api/assets/record-image")

/// The faces the picture uses, each at its default instance: a title in Fraunces Italic (optical size 9),
/// labels in Space Grotesk (Light) and a line under the title in Source Serif 4 Italic, which is static.
let fonts = ["fraunces-italic-latin", "space-grotesk-latin", "source-serif-4-italic-latin"]

/// Tables that make a font variable. Without them the font is its default instance.
let variation: Set<String> = ["fvar", "gvar", "avar", "cvar", "HVAR", "VVAR", "MVAR", "STAT"]

func tagName(_ tag: CTFontTableTag) -> String {
  String(bytes: [24, 16, 8, 0].map { UInt8((tag >> $0) & 0xFF) }, encoding: .ascii)!
}

func checksum(_ data: Data) -> UInt32 {
  var padded = data
  while padded.count % 4 != 0 { padded.append(0) }
  var sum: UInt32 = 0
  padded.withUnsafeBytes { bytes in
    for index in stride(from: 0, to: bytes.count, by: 4) {
      sum = sum &+ (UInt32(bytes[index]) << 24 | UInt32(bytes[index + 1]) << 16 | UInt32(bytes[index + 2]) << 8 | UInt32(bytes[index + 3]))
    }
  }
  return sum
}

func append32(_ data: inout Data, _ value: UInt32) { withUnsafeBytes(of: value.bigEndian) { data.append(contentsOf: $0) } }
func append16(_ data: inout Data, _ value: UInt16) { withUnsafeBytes(of: value.bigEndian) { data.append(contentsOf: $0) } }

try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
for name in fonts {
  let woff2 = try Data(contentsOf: source.appendingPathComponent("\(name).woff2"))
  guard let descriptor = CTFontManagerCreateFontDescriptorFromData(woff2 as CFData) else {
    fatalError("CoreText could not read \(name).woff2")
  }
  let font = CTFontCreateWithFontDescriptor(descriptor, 0, nil)
  // The array holds the tags themselves, not objects, so each is read from its pointer's bits.
  guard let available = CTFontCopyAvailableTables(font, []) else { fatalError("CoreText lists no tables in \(name).woff2") }
  let tags = (0..<CFArrayGetCount(available))
    .map { CTFontTableTag(UInt(bitPattern: CFArrayGetValueAtIndex(available, $0))) }
    .filter { !variation.contains(tagName($0)) }
  var tables: [(tag: CTFontTableTag, data: Data)] = tags.compactMap { tag in
    guard let table = CTFontCopyTable(font, tag, []) else { return nil }
    return (tag, table as Data)
  }
  tables.sort { $0.tag < $1.tag }
  guard tables.contains(where: { tagName($0.tag) == "glyf" }), let headIndex = tables.firstIndex(where: { tagName($0.tag) == "head" }) else {
    fatalError("\(name) has no TrueType outlines or no head table")
  }
  // The whole file's checksum adjustment is set last, over a head table that holds zero there.
  tables[headIndex].data.replaceSubrange(8..<12, with: Data(count: 4))

  let count = UInt16(tables.count)
  let power = 1 << (UInt16.bitWidth - 1 - count.leadingZeroBitCount)
  var file = Data()
  append32(&file, 0x0001_0000)
  append16(&file, count)
  append16(&file, UInt16(power * 16))
  append16(&file, UInt16(Int(log2(Double(power)))))
  append16(&file, count * 16 - UInt16(power * 16))
  var offset = 12 + 16 * tables.count
  var body = Data()
  for table in tables {
    append32(&file, table.tag)
    append32(&file, checksum(table.data))
    append32(&file, UInt32(offset))
    append32(&file, UInt32(table.data.count))
    var padded = table.data
    while padded.count % 4 != 0 { padded.append(0) }
    body.append(padded)
    offset += padded.count
  }
  let headOffset = 12 + 16 * tables.count + tables[..<headIndex].reduce(0) { $0 + ($1.data.count + 3) / 4 * 4 }
  file.append(body)
  let adjustment = 0xB1B0_AFBA &- checksum(file)
  withUnsafeBytes(of: adjustment.bigEndian) { file.replaceSubrange(headOffset + 8..<headOffset + 12, with: $0) }
  let out = target.appendingPathComponent("\(name).ttf")
  try file.write(to: out)
  print("\(out.lastPathComponent): \(tables.count) tables, \(file.count) bytes")
}
