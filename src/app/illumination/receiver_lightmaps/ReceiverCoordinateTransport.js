// Validates row-addressed coordinate chunks before assembling the exact float32 table.
// @ts-check
export function receiverCoordinateChunks(chunks, mapping) {
    const rows = chunks.filter(c => c.descriptor.id.startsWith('mapping.coordinates.'))
        .sort((a, b) => a.descriptor.coordinateTransform.firstRow - b.descriptor.coordinateTransform.firstRow);
    let next = 0;
    for (const chunk of rows) {
        const d = chunk.descriptor, transform = d.coordinateTransform;
        if (transform.schema !== 'bus-sim-receiver-mapping-rows-v1' || transform.firstRow !== next
            || d.encoding !== 'rgba32f_le' || d.dimensions.width !== mapping.tableWidth
            || d.dimensions.height < 1 || chunk.data.byteLength !== mapping.tableWidth*d.dimensions.height*16) throw new Error('Receiver coordinate row mismatch');
        next += d.dimensions.height;
    }
    if (next !== mapping.tableHeight) throw new Error('Incomplete receiver coordinate rows');
    return rows;
}
