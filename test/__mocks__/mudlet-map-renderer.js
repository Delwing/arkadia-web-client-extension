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
  createSettings,
};
