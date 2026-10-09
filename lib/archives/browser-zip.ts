export type BrowserZipEntry = {
    fileName: string;
    data: Uint8Array;
    modifiedAt?: Date;
};

type PreparedZipEntry = BrowserZipEntry & {
    fileNameBytes: Uint8Array;
    crc32: number;
    offset: number;
    dosDate: number;
    dosTime: number;
};

const crc32Table = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    crc32Table[index] = value >>> 0;
}

function calculateCrc32(data: Uint8Array): number {
    let crc = 0xffffffff;

    for (const byte of data) {
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { dosDate: number; dosTime: number } {
    const year = Math.max(1980, date.getFullYear());

    return {
        dosDate:
            ((year - 1980) << 9) |
            ((date.getMonth() + 1) << 5) |
            date.getDate(),
        dosTime:
            (date.getHours() << 11) |
            (date.getMinutes() << 5) |
            Math.floor(date.getSeconds() / 2),
    };
}

function writeBytes(target: Uint8Array, offset: number, source: Uint8Array): number {
    target.set(source, offset);
    return offset + source.byteLength;
}

export function createBrowserZip(entries: BrowserZipEntry[]): Uint8Array {
    const textEncoder = new TextEncoder();
    let localSize = 0;
    const preparedEntries: PreparedZipEntry[] = entries.map((entry) => {
        const fileNameBytes = textEncoder.encode(entry.fileName);
        const { dosDate, dosTime } = toDosDateTime(entry.modifiedAt ?? new Date());
        const preparedEntry = {
            ...entry,
            fileNameBytes,
            crc32: calculateCrc32(entry.data),
            offset: localSize,
            dosDate,
            dosTime,
        };

        localSize += 30 + fileNameBytes.byteLength + entry.data.byteLength;
        return preparedEntry;
    });
    const centralSize = preparedEntries.reduce(
        (size, entry) => size + 46 + entry.fileNameBytes.byteLength,
        0,
    );
    const archive = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(archive.buffer);
    let offset = 0;

    for (const entry of preparedEntries) {
        view.setUint32(offset, 0x04034b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 0x0800, true);
        view.setUint16(offset + 8, 0, true);
        view.setUint16(offset + 10, entry.dosTime, true);
        view.setUint16(offset + 12, entry.dosDate, true);
        view.setUint32(offset + 14, entry.crc32, true);
        view.setUint32(offset + 18, entry.data.byteLength, true);
        view.setUint32(offset + 22, entry.data.byteLength, true);
        view.setUint16(offset + 26, entry.fileNameBytes.byteLength, true);
        view.setUint16(offset + 28, 0, true);
        offset += 30;
        offset = writeBytes(archive, offset, entry.fileNameBytes);
        offset = writeBytes(archive, offset, entry.data);
    }

    const centralOffset = offset;
    for (const entry of preparedEntries) {
        view.setUint32(offset, 0x02014b50, true);
        view.setUint16(offset + 4, 20, true);
        view.setUint16(offset + 6, 20, true);
        view.setUint16(offset + 8, 0x0800, true);
        view.setUint16(offset + 10, 0, true);
        view.setUint16(offset + 12, entry.dosTime, true);
        view.setUint16(offset + 14, entry.dosDate, true);
        view.setUint32(offset + 16, entry.crc32, true);
        view.setUint32(offset + 20, entry.data.byteLength, true);
        view.setUint32(offset + 24, entry.data.byteLength, true);
        view.setUint16(offset + 28, entry.fileNameBytes.byteLength, true);
        view.setUint16(offset + 30, 0, true);
        view.setUint16(offset + 32, 0, true);
        view.setUint16(offset + 34, 0, true);
        view.setUint16(offset + 36, 0, true);
        view.setUint32(offset + 38, 0, true);
        view.setUint32(offset + 42, entry.offset, true);
        offset += 46;
        offset = writeBytes(archive, offset, entry.fileNameBytes);
    }

    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, preparedEntries.length, true);
    view.setUint16(offset + 10, preparedEntries.length, true);
    view.setUint32(offset + 12, centralSize, true);
    view.setUint32(offset + 16, centralOffset, true);
    view.setUint16(offset + 20, 0, true);

    return archive;
}
