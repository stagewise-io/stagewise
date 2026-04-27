Add maps to Remotion with Mapbox. See <https://docs.mapbox.com/mapbox-gl-js/api/> for API.

Need Mapbox(`mapbox-gl`) + `@turf/turf` JS packages.

User must create free Mapbox account and token: <https://console.mapbox.com/account/access-tokens/>

Put token in `.env`: ```REMOTION_MAPBOX_TOKEN=pk.your-mapbox-access-token```

## Adding a map

Basic Remotion map:

```tsx
import{useEffect,useMemo,useRef,useState}from"react";import{AbsoluteFill,useDelayRender,useVideoConfig}from"remotion";import mapboxgl,{Map}from"mapbox-gl";export const lineCoordinates=[[6.56158447265625,46.059891147620725],[6.5691375732421875,46.05679376154153],[6.5842437744140625,46.05059898938315],[6.594886779785156,46.04702502069337],[6.601066589355469,46.0460718554722],[6.6089630126953125,46.0365370783104],[6.6185760498046875,46.018420689207964]];mapboxgl.accessToken=process.env.REMOTION_MAPBOX_TOKEN as string;export const MyComposition=()=>{const ref=useRef<HTMLDivElement>(null);const{delayRender,continueRender}=useDelayRender();const{width,height}=useVideoConfig();const[handle]=useState(()=>delayRender("Loading map..."));const[map,setMap]=useState<Map|null>(null);useEffect(()=>{const _map=new Map({container:ref.current!,zoom:11.53,center:[6.5615,46.0598],pitch:65,bearing:0,style:"⁠mapbox://styles/mapbox/standard",interactive:false,fadeDuration:0});_map.on("style.load",()=>{const hideFeatures=["showRoadsAndTransit","showRoads","showTransit","showPedestrianRoads","showRoadLabels","showTransitLabels","showPlaceLabels","showPointOfInterestLabels","showPointsOfInterest","showAdminBoundaries","showLandmarkIcons","showLandmarkIconLabels","show3dObjects","show3dBuildings","show3dTrees","show3dLandmarks","show3dFacades"];for(const featureof hideFeatures){_map.setConfigProperty("basemap",feature,false)}_map.setConfigProperty("basemap","colorTrunks","rgba(0, 0, 0, 0)");_map.addSource("trace",{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"LineString",coordinates:lineCoordinates}}});_map.addLayer({type:"line",source:"trace",id:"line",paint:{"line-color":"black","line-width":5},layout:{"line-cap":"round","line-join":"round"}})});_map.on("load",()=>{continueRender(handle);setMap(_map)})},[handle,lineCoordinates]);const style:React.CSSProperties=useMemo(()=>({width,height,position:"absolute"}),[width,height]);return<AbsoluteFill ref={ref} style={style} />};
```

Important in Remotion:

- Drive animation with `useCurrentFrame()`. Disable Mapbox self-animation: `fadeDuration: 0`, `interactive: false`, etc.
- Delay map load with `useDelayRender()`. Keep map `null` until loaded.
- Ref element must have explicit `width`, `height`, `position: "absolute"`.
- Do not add `_map.remove();` cleanup.

## Drawing lines

Unless asked: no glow effect, no extra points

## Map style

Default: `mapbox://styles/mapbox/standard`.  
Hide base-map labels.

Unless asked otherwise, remove all Mapbox Standard features.

```tsx
const hideFeatures=["showRoadsAndTransit","showRoads","showTransit","showPedestrianRoads","showRoadLabels","showTransitLabels","showPlaceLabels","showPointOfInterestLabels","showPointsOfInterest","showAdminBoundaries","showLandmarkIcons","showLandmarkIconLabels","show3dObjects","show3dBuildings","show3dTrees","show3dLandmarks","show3dFacades"];for(const featureof hideFeatures){_map.setConfigProperty("basemap",feature,false)}_map.setConfigProperty("basemap","colorMotorways","transparent");_map.setConfigProperty("basemap","colorRoads","transparent");_map.setConfigProperty("basemap","colorTrunks","transparent");
```

## Animating camera

Animate camera along line in `useEffect` based on current frame.

Unless asked, do not jump between camera angles.

```tsx
import*as turf from"@turf/turf";import{interpolate}from"remotion";import{Easing}from"remotion";import{useCurrentFrame,useVideoConfig,useDelayRender}from"remotion";const animationDuration=20;const cameraAltitude=4000;
```

```tsx
const frame=useCurrentFrame();const{fps}=useVideoConfig();const{delayRender,continueRender}=useDelayRender();useEffect(()=>{if(!map){return}const handle=delayRender("Moving point...");const routeDistance=turf.length(turf.lineString(lineCoordinates));const progress=interpolate(frame/fps,[0.00001,animationDuration],[0,1],{easing:Easing.inOut(Easing.sin),extrapolateLeft:"clamp",extrapolateRight:"clamp"});const camera=map.getFreeCameraOptions();const alongRoute=turf.along(turf.lineString(lineCoordinates),routeDistance*progress).geometry.coordinates;camera.lookAtPoint({lng:alongRoute[0],lat:alongRoute[1]});map.setFreeCameraOptions(camera);map.once("idle",()=>continueRender(handle))},[lineCoordinates,fps,frame,handle,map]);
```

Notes:

IMPORTANT: Keep camera so north stays up by default.  
IMPORTANT: For multi-step animation, set all properties at all stages: zoom, position, line progress. Else jumps.

- Clamp progress above zero so line never fully empty. Prevent turf errors.
- See [Timing](./timing.md) for more timing options.
- Check composition size. Make lines thick enough and labels large enough after scale-down.

## Animating lines

### Straight lines (linear interpolation)

For line that should look straight on map, linearly interpolate coords. Do NOT use turf `lineSliceAlong` or `along` here. Those use geodesic math and look curved on Mercator.

```tsx
const frame=useCurrentFrame();const{durationInFrames}=useVideoConfig();useEffect(()=>{if(!map)return;const animationHandle=delayRender("Animating line...");const progress=interpolate(frame,[0,durationInFrames-1],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing:Easing.inOut(Easing.cubic)});const start=lineCoordinates[0];const end=lineCoordinates[1];const currentLng=start[0]+(end[0]-start[0])*progress;const currentLat=start[1]+(end[1]-start[1])*progress;const lineData:GeoJSON.Feature<GeoJSON.LineString>={type:"Feature",properties:{},geometry:{type:"LineString",coordinates:[start,[currentLng,currentLat]]}};const source=map.getSource("trace")as mapboxgl.GeoJSONSource;if(source){source.setData(lineData)}map.once("idle",()=>continueRender(animationHandle))},[frame,map,durationInFrames]);
```

### Curved lines (geodesic/great circle)

For geodesic path between two points, use turf `lineSliceAlong`. Good for flight paths or true shortest Earth route.

```tsx
import*as turf from"@turf/turf";const routeLine=turf.lineString(lineCoordinates);const routeDistance=turf.length(routeLine);const currentDistance=Math.max(0.001,routeDistance*progress);const slicedLine=turf.lineSliceAlong(routeLine,0,currentDistance);const source=map.getSource("route")as mapboxgl.GeoJSONSource;if(source){source.setData(slicedLine)}
```

## Markers

Add labels and markers where appropriate.

```tsx
_map.addSource("markers",{type:"geojson",data:{type:"FeatureCollection",features:[{type:"Feature",properties:{name:"Point 1"},geometry:{type:"Point",coordinates:[-118.2437,34.0522]}}]}});_map.addLayer({id:"city-markers",type:"circle",source:"markers",paint:{"circle-radius":40,"circle-color":"#FF4444","circle-stroke-width":4,"circle-stroke-color":"#FFFFFF"}});_map.addLayer({id:"labels",type:"symbol",source:"markers",layout:{"text-field":["get","name"],"text-font":["DIN Pro Bold","Arial Unicode MS Bold"],"text-size":50,"text-offset":[0,0.5],"text-anchor":"top"},paint:{"text-color":"#FFFFFF","text-halo-color":"#000000","text-halo-width":2}});
```

Make them big enough. Scale for composition size. For `1920x1080`, label font size should be at least `40px`.

IMPORTANT: Keep `text-offset` small so label stays near marker. For circle radius `40`, good offset:

```tsx
"text-offset":[0,0.5]
```

## 3D buildings

Enable 3D buildings:

```tsx
_map.setConfigProperty("basemap","show3dObjects",true);
_map.setConfigProperty("basemap","show3dLandmarks",true);
_map.setConfigProperty("basemap","show3dBuildings",true);
```

## Rendering map animations

```bash
npx remotion render --gl=angle --concurrency=1
```
