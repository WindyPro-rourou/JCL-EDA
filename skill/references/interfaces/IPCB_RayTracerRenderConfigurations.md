# IPCB\_RayTracerRenderConfigurations interface

光追渲染配置

## Signature

```typescript
interface IPCB_RayTracerRenderConfigurations
```

## Remarks

各字段可选，按字段部分更新生效

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

[background?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

[IPCB\_RayTracerBackgroundConfig](./IPCB_RayTracerBackgroundConfig.md)

</td><td>

_(Optional)_ 背景配置

</td></tr>
<tr><td>

[file?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

File

</td><td>

_(Optional)_ 附加资源文件（背景 HDR / 渲染器 LUT）

</td></tr>
<tr><td>

[light?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

Record&lt;string, [IPCB\_RayTracerLightConfig](./IPCB_RayTracerLightConfig.md)<!-- -->&gt;

</td><td>

_(Optional)_ 光源配置，按光源名索引

</td></tr>
<tr><td>

[materialConfig?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

[IPCB\_RayTracerMaterialConfig](./IPCB_RayTracerMaterialConfig.md)

</td><td>

_(Optional)_ 选中材质配置

</td></tr>
<tr><td>

[pcbMaterialConfig?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

[IPCB\_RayTracerPcbMaterialConfig](./IPCB_RayTracerPcbMaterialConfig.md)

</td><td>

_(Optional)_ PCB 材质配置

</td></tr>
<tr><td>

[renderer?](./IPCB_RayTracerRenderConfigurations.md)

</td><td>

</td><td>

[IPCB\_RayTracerRendererConfig](./IPCB_RayTracerRendererConfig.md)

</td><td>

_(Optional)_ 渲染器配置

</td></tr>
</tbody></table>

---

## 属性详情

### background

# IPCB\_RayTracerRenderConfigurations.background property

背景配置

## Signature

```typescript
background?: IPCB_RayTracerBackgroundConfig;
```

### file

# IPCB\_RayTracerRenderConfigurations.file property

附加资源文件（背景 HDR / 渲染器 LUT）

## Signature

```typescript
file?: File;
```

### light

# IPCB\_RayTracerRenderConfigurations.light property

光源配置，按光源名索引

## Signature

```typescript
light?: Record<string, IPCB_RayTracerLightConfig>;
```

### materialconfig

# IPCB\_RayTracerRenderConfigurations.materialConfig property

选中材质配置

## Signature

```typescript
materialConfig?: IPCB_RayTracerMaterialConfig;
```

### pcbmaterialconfig

# IPCB\_RayTracerRenderConfigurations.pcbMaterialConfig property

PCB 材质配置

## Signature

```typescript
pcbMaterialConfig?: IPCB_RayTracerPcbMaterialConfig;
```

### renderer

# IPCB\_RayTracerRenderConfigurations.renderer property

渲染器配置

## Signature

```typescript
renderer?: IPCB_RayTracerRendererConfig;
```
