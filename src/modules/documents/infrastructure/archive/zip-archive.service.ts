export type ZipArchiveEntry = {
    path: string;
    data: Uint8Array;
    modifiedAt?: Date;
};

type CentralDirectoryEntry = {
    pathBytes: Buffer;
    crc32: number;
    size: number;
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
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = Math.floor(date.getSeconds() / 2);

    return {
        dosDate: ((year - 1980) << 9) | (month << 5) | day,
        dosTime: (hours << 11) | (minutes << 5) | seconds,
    };
}

function createLocalFileHeader(entry: CentralDirectoryEntry): Buffer {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(entry.dosTime, 10);
    header.writeUInt16LE(entry.dosDate, 12);
    header.writeUInt32LE(entry.crc32, 14);
    header.writeUInt32LE(entry.size, 18);
    header.writeUInt32LE(entry.size, 22);
    header.writeUInt16LE(entry.pathBytes.length, 26);
    header.writeUInt16LE(0, 28);

    return header;
}

function createCentralDirectoryHeader(entry: CentralDirectoryEntry): Buffer {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(entry.dosTime, 12);
    header.writeUInt16LE(entry.dosDate, 14);
    header.writeUInt32LE(entry.crc32, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.pathBytes.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(entry.offset, 42);

    return header;
}

function createEndOfCentralDirectory(params: {
    entryCount: number;
    centralDirectorySize: number;
    centralDirectoryOffset: number;
}): Buffer {
    const header = Buffer.alloc(22);
    header.writeUInt32LE(0x06054b50, 0);
    header.writeUInt16LE(0, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(params.entryCount, 8);
    header.writeUInt16LE(params.entryCount, 10);
    header.writeUInt32LE(params.centralDirectorySize, 12);
    header.writeUInt32LE(params.centralDirectoryOffset, 16);
    header.writeUInt16LE(0, 20);

    return header;
}

export class ZipArchiveService {
    createArchive(entries: ZipArchiveEntry[]): Buffer {
        const fileParts: Buffer[] = [];
        const centralDirectoryParts: Buffer[] = [];
        const centralDirectoryEntries: CentralDirectoryEntry[] = [];
        let offset = 0;

        for (const sourceEntry of entries) {
            const pathBytes = Buffer.from(sourceEntry.path, "utf8");
            const data = Buffer.from(sourceEntry.data);
            const { dosDate, dosTime } = toDosDateTime(
                sourceEntry.modifiedAt ?? new Date(),
            );
            const entry: CentralDirectoryEntry = {
                pathBytes,
                crc32: calculateCrc32(data),
                size: data.byteLength,
                offset,
                dosDate,
                dosTime,
            };
            const localHeader = createLocalFileHeader(entry);

            fileParts.push(localHeader, pathBytes, data);
            offset += localHeader.byteLength + pathBytes.byteLength + data.byteLength;
            centralDirectoryEntries.push(entry);
        }

        const centralDirectoryOffset = offset;
        let centralDirectorySize = 0;

        for (const entry of centralDirectoryEntries) {
            const centralHeader = createCentralDirectoryHeader(entry);
            centralDirectoryParts.push(centralHeader, entry.pathBytes);
            centralDirectorySize += centralHeader.byteLength + entry.pathBytes.byteLength;
        }

        return Buffer.concat([
            ...fileParts,
            ...centralDirectoryParts,
            createEndOfCentralDirectory({
                entryCount: centralDirectoryEntries.length,
                centralDirectorySize,
                centralDirectoryOffset,
            }),
        ]);
    }
}
