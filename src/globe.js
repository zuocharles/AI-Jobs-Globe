/**
 * Cesium Viewer + Google Photorealistic 3D Tiles bootstrap.
 *
 * The 3D Tiles call is the visual win — same asset Bilawal Sidhu's WorldView
 * uses. Without it we fall back to Cesium World Imagery (Bing).
 */
import {
  Viewer,
  Cesium3DTileset,
  IonImageryProvider,
  ImageryLayer,
  Color,
  Cartesian3,
  Math as CesiumMath,
  Ion,
} from 'cesium';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Optional Cesium Ion default token (Bing imagery + world terrain).
// We use Google's photoreal tiles instead, but keep Ion available for fallback imagery.
Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || Ion.defaultAccessToken;

/**
 * Initialize the Cesium Viewer with our SIGINT defaults and the Google
 * photorealistic 3D tileset.
 *
 * @param {string} containerId  DOM id where the Viewer mounts.
 * @returns {{ viewer: Viewer, tilesetReady: Promise<Cesium3DTileset|null> }}
 */
export function createGlobe(containerId) {
  const viewer = new Viewer(containerId, {
    // Strip every default widget — we draw our own SIGINT chrome.
    animation: false,
    timeline: false,
    fullscreenButton: false,
    homeButton: false,
    sceneModePicker: false,
    baseLayerPicker: false,
    navigationHelpButton: false,
    geocoder: false,
    selectionIndicator: false,
    infoBox: false,
    // Skip the default imagery layer — Google 3D Tiles will provide visuals.
    baseLayer: false,
    // WebGL2 + anti-aliasing for the look.
    contextOptions: {
      webgl: { alpha: true, antialias: true, powerPreference: 'high-performance' },
    },
    // Do not auto-spin globe; we'll handle camera ourselves.
    requestRenderMode: false,
    targetFrameRate: 60,
  });

  // Black space + true-black atmosphere fallback.
  const scene = viewer.scene;
  scene.backgroundColor = Color.fromCssColorString('#000000');
  scene.skyBox.show = true;       // stars
  scene.skyAtmosphere.show = true; // soft Earth halo
  scene.skyAtmosphere.hueShift = -0.05;
  scene.skyAtmosphere.brightnessShift = -0.2;
  scene.skyAtmosphere.saturationShift = -0.1;
  scene.fog.enabled = true;
  scene.fog.density = 0.00012;
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = true;
  scene.globe.atmosphereLightIntensity = 6;
  scene.globe.dynamicAtmosphereLighting = true;
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.baseColor = Color.fromCssColorString('#04070d');

  // Frame the globe roughly centred in the visible viewport. The TARGETS
  // rail (240 px) blocks the left edge and the topbar blocks the top, so
  // we shift the camera target SOUTH-WEST of true North-America center
  // so the visible globe lands in the right ~70% of the screen.
  // Pitch -85° (near top-down) keeps the globe round instead of horizoned.
  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(-115.0, 25.0, 14_000_000),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-85), roll: 0 },
  });

  // Camera limits: 200m floor (street-level on Google 3D Tiles), 30,000km
  // ceiling (high orbit). Collision detection keeps the camera off geometry,
  // which prevents the "zoom into a spike and get stuck inside the column" bug.
  const cam = scene.screenSpaceCameraController;
  cam.minimumZoomDistance = 200;
  cam.maximumZoomDistance = 30_000_000;
  cam.enableCollisionDetection = true;
  // Snappier wheel-zoom: inertia 0 means each scroll moves immediately and
  // doesn't queue behind the prior one. Fixes the "I can't zoom out after
  // zooming in" feel where overlapping inertia events cancel each other.
  cam.inertiaZoom = 0;
  cam.inertiaTranslate = 0.5;
  cam.inertiaSpin = 0.5;
  // Collision detection only when very close to terrain (default 15km is
  // overzealous and interferes with smooth zoom at orbit altitudes).
  cam.minimumCollisionTerrainHeight = 5_000;

  // Mount Google Photorealistic 3D Tiles. Returns a promise so callers can
  // await first-tile load for the loading bar.
  const tilesetReady = (async () => {
    if (!GOOGLE_KEY) {
      console.warn('VITE_GOOGLE_MAPS_API_KEY missing — falling back to Cesium World Imagery.');
      const layer = ImageryLayer.fromProviderAsync(IonImageryProvider.fromAssetId(2));
      viewer.imageryLayers.add(layer);
      return null;
    }
    try {
      const tileset = await Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_KEY}`,
        {
          // Google requires their attribution be visible on screen.
          showCreditsOnScreen: true,
          // Photoreal tiles are ECEF — let Cesium swap globe imagery in/out cleanly.
          maximumScreenSpaceError: 16,
        },
      );
      scene.primitives.add(tileset);
      // Once Google tiles are mounted, hide the default ellipsoid base color
      // glow — the tileset is the ground.
      scene.globe.show = false;
      return tileset;
    } catch (err) {
      console.error('Google 3D Tiles failed; falling back to Cesium World Imagery.', err);
      const layer = ImageryLayer.fromProviderAsync(IonImageryProvider.fromAssetId(2));
      viewer.imageryLayers.add(layer);
      return null;
    }
  })();

  return { viewer, tilesetReady };
}

/**
 * Smoothly fly the camera to a (lat, lon) viewpoint.
 * @param {Viewer} viewer
 * @param {number} lat
 * @param {number} lon
 * @param {number} altitudeMeters
 * @param {number} durationSec
 */
export function flyTo(viewer, lat, lon, altitudeMeters = 60_000, durationSec = 1.6) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, altitudeMeters),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-55), roll: 0 },
    duration: durationSec,
  });
}

