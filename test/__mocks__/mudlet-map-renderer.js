// Mock for mudlet-map-renderer to avoid Konva ES module issues in tests

class MapReader {
  constructor() {}

  getRoomById() {
    return null;
  }

  getRoomsByArea() {
    return [];
  }
}

class PathFinder {
  constructor() {}

  findPath() {
    return [];
  }
}


/**
 * Minimal stand-in for the renderer's graph builder: reads each room's exits into an adjacency
 * map, weighting every edge by the target room's weight the way the real one does. Enough for
 * pathfinding code under test; the real traversal rules are covered by the package's own tests.
 */
class MapGraph {
  constructor(reader) {
    this.rooms = typeof reader?.getRooms === 'function' ? reader.getRooms() : [];
  }

  getAdj() {
    const adj = new Map();
    for (const room of this.rooms) {
      const edges = [];
      const exits = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
      for (const target of Object.values(exits)) {
        const to = this.rooms.find((r) => r.id === target);
        if (!to) continue;
        edges.push({ id: target, weight: Math.max(to.weight ?? 1, 1) });
      }
      adj.set(room.id, edges);
    }
    return adj;
  }
}

function createSettings() {
  return {
    roomSize: 0.6,
    lineWidth: 0.025,
    lineColor: 'rgb(225, 255, 225)',
    backgroundColor: '#000000',
    instantMapMove: false,
    highlightCurrentRoom: true,
    cullingEnabled: true,
    cullingMode: 'indexed',
    cullingBounds: null,
    labelRenderMode: 'image',
    transparentLabels: false,
    roomShape: 'rectangle',
    playerMarker: {
      strokeColor: '#00e5b2',
      strokeAlpha: 1.0,
      fillColor: '#00e5b2',
      fillAlpha: 0.0,
      strokeWidth: 0.1,
      sizeFactor: 1.7,
      dash: [0.05, 0.05],
      dashEnabled: true,
      matchRoomShape: false,
    },
    highlight: {
      strokeAlpha: 1.0,
      fillAlpha: 0.0,
      strokeWidth: 0.1,
      sizeFactor: 1.425,
      dash: [0.05, 0.05],
      dashEnabled: true,
      matchRoomShape: true,
      shape: 'match',
    },
    gridEnabled: false,
    gridSize: 1,
    gridColor: 'rgba(255, 255, 255, 0.07)',
    gridLineWidth: 0.02,
    perfCallback: null,
  };
}

module.exports = {
  MapReader,
  PathFinder,
  MapGraph,
  createSettings,
};
