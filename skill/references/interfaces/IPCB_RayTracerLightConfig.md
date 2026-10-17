# IPCB\_RayTracerLightConfig interface

光追光源配置

## Signature

```typescript
interface IPCB_RayTracerLightConfig
```

## Properties

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[cameraVisible?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 相机可见

</td></tr>
<tr><td>

[castShadow?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 是否投射阴影

</td></tr>
<tr><td>

[color?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 颜色

</td></tr>
<tr><td>

[colorMap?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 颜色贴图名

</td></tr>
<tr><td>

[file?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

File

</td><td>

_(Optional)_ 光源贴图文件

</td></tr>
<tr><td>

[hideRender?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 渲染时隐藏

</td></tr>
<tr><td>

[normalize?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 是否归一化

</td></tr>
<tr><td>

[position?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

\{ x?: number; y?: number; z?: number \}

</td><td>

_(Optional)_ 位置

</td></tr>
<tr><td>

[power?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ 功率

</td></tr>
<tr><td>

[rayVisibilityDiffuse?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 光线可见性-漫反射

</td></tr>
<tr><td>

[rayVisibilityGlossy?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 光线可见性-光泽

</td></tr>
<tr><td>

[rotate?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

\{ x?: number; y?: number; z?: number \}

</td><td>

_(Optional)_ 旋转

</td></tr>
<tr><td>

[size?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

\{ width?: number; height?: number \}

</td><td>

_(Optional)_ 尺寸

</td></tr>
<tr><td>

[spread?](./IPCB_RayTracerLightConfig.md)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ 扩散角

</td></tr>
</tbody></table>

---

## 属性详情

### cameravisible

# IPCB\_RayTracerLightConfig.cameraVisible property

相机可见

## Signature

```typescript
cameraVisible?: boolean;
```

### castshadow

# IPCB\_RayTracerLightConfig.castShadow property

是否投射阴影

## Signature

```typescript
castShadow?: boolean;
```

### color

# IPCB\_RayTracerLightConfig.color property

颜色

## Signature

```typescript
color?: string;
```

### colormap

# IPCB\_RayTracerLightConfig.colorMap property

颜色贴图名

## Signature

```typescript
colorMap?: string;
```

### file

# IPCB\_RayTracerLightConfig.file property

光源贴图文件

## Signature

```typescript
file?: File;
```

### hiderender

# IPCB\_RayTracerLightConfig.hideRender property

渲染时隐藏

## Signature

```typescript
hideRender?: boolean;
```

### normalize

# IPCB\_RayTracerLightConfig.normalize property

是否归一化

## Signature

```typescript
normalize?: boolean;
```

### position

# IPCB\_RayTracerLightConfig.position property

位置

## Signature

```typescript
position?: { x?: number; y?: number; z?: number };
```

### power

# IPCB\_RayTracerLightConfig.power property

功率

## Signature

```typescript
power?: number;
```

### rayvisibilitydiffuse

# IPCB\_RayTracerLightConfig.rayVisibilityDiffuse property

光线可见性-漫反射

## Signature

```typescript
rayVisibilityDiffuse?: boolean;
```

### rayvisibilityglossy

# IPCB\_RayTracerLightConfig.rayVisibilityGlossy property

光线可见性-光泽

## Signature

```typescript
rayVisibilityGlossy?: boolean;
```

### rotate

# IPCB\_RayTracerLightConfig.rotate property

旋转

## Signature

```typescript
rotate?: { x?: number; y?: number; z?: number };
```

### size

# IPCB\_RayTracerLightConfig.size property

尺寸

## Signature

```typescript
size?: { width?: number; height?: number };
```

### spread

# IPCB\_RayTracerLightConfig.spread property

扩散角

## Signature

```typescript
spread?: number;
```
