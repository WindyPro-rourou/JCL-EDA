# PCB\_RayTracerEngine class

PCB &amp; footprint / ray tracer engine class

## Signature

```typescript
class PCB_RayTracerEngine
```

## Remarks

Controls the docking and interaction of the ray tracer engine

## Methods

<table><thead><tr><th>

Method

</th><th>

Modifiers

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[addSceneElement(file)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 添加场景元素

</td></tr>
<tr><td>

[dispose()](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** Stop the ray tracer engine

</td></tr>
<tr><td>

[exportImage()](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 导出当前画布光追渲染效果图片（PNG）

</td></tr>
<tr><td>

[getLightConfigurations(lightName)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** Get the ray tracer light configurations

</td></tr>
<tr><td>

[getRenderConfigurations()](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** Get the ray tracer render configurations

</td></tr>
<tr><td>

[getSceneElements()](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 获取当前所有场景元素

</td></tr>
<tr><td>

[init(resourceProvider)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** Initialize the ray tracer engine

</td></tr>
<tr><td>

[pauseRender()](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 暂停光线追踪渲染

</td></tr>
<tr><td>

[removeSceneElement(id)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 移除场景元素

</td></tr>
<tr><td>

[setRenderConfigurations(configurations)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** Set the ray tracer render configurations

</td></tr>
<tr><td>

[setSceneElementTransform(id, transform)](./PCB_RayTracerEngine.md)

</td><td>

</td><td>

**_(BETA)_** 修改场景元素变换参数

</td></tr>
</tbody></table>

---

## 方法详情

### addsceneelement

# PCB\_RayTracerEngine.addSceneElement() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

添加场景元素

## Signature

```typescript
function addSceneElement(file: Blob): Promise<IPCB_RayTracerSceneElement>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

file

</td><td>

Blob

</td><td>

obj 文件

</td></tr>
</tbody></table>

## Returns

Promise&lt;[IPCB\_RayTracerSceneElement](../interfaces/IPCB_RayTracerSceneElement.md)<!-- -->&gt;

新增的场景元素

## Remarks

ADD since EDA v4.1.79

### dispose

# PCB\_RayTracerEngine.dispose() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Stop the ray tracer engine

## Signature

```typescript
function dispose(): Promise<void>;
```

## Returns

Promise&lt;void&gt;

## Remarks

ADD since EDA v4.1.79

### exportimage

# PCB\_RayTracerEngine.exportImage() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

导出当前画布光追渲染效果图片（PNG）

## Signature

```typescript
function exportImage(): Promise<Blob>;
```

## Returns

Promise&lt;Blob&gt;

图片数据

## Remarks

ADD since EDA v4.1.79

### getlightconfigurations

# PCB\_RayTracerEngine.getLightConfigurations() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Get the ray tracer light configurations

## Signature

```typescript
function getLightConfigurations(lightName: string): Promise<any>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

lightName

</td><td>

string

</td><td>

</td></tr>
</tbody></table>

## Returns

Promise&lt;any&gt;

Light configuration

## Remarks

The [get ray tracer render configurations](./PCB_RayTracerEngine.md) API contains a light configuration. This API is used to get different light configurations

The configuration definition of this API is still in progress ADD since EDA v4.1.79

### getrenderconfigurations

# PCB\_RayTracerEngine.getRenderConfigurations() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Get the ray tracer render configurations

## Signature

```typescript
function getRenderConfigurations(): Promise<IPCB_RayTracerRenderConfigurations>;
```

## Returns

Promise&lt;[IPCB\_RayTracerRenderConfigurations](../interfaces/IPCB_RayTracerRenderConfigurations.md)<!-- -->&gt;

Render configuration

## Remarks

The configuration definition of this API is still in progress ADD since EDA v4.1.79

### getsceneelements

# PCB\_RayTracerEngine.getSceneElements() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

获取当前所有场景元素

## Signature

```typescript
function getSceneElements(): Promise<IPCB_RayTracerSceneElement[]>;
```

## Returns

Promise&lt;[IPCB\_RayTracerSceneElement](../interfaces/IPCB_RayTracerSceneElement.md)<!-- -->\[\]&gt;

场景元素列表

## Remarks

ADD since EDA v4.1.79

### init

# PCB\_RayTracerEngine.init() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Initialize the ray tracer engine

## Signature

```typescript
function init(resourceProvider?: (path: string) => Promise<Blob>): Promise<void>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

resourceProvider

</td><td>

(path: string) =&gt; Promise&lt;Blob&gt;

</td><td>

_(Optional)_ 可选的光线追踪资源提供者：引擎按需以文件路径向扩展请求单个资源，扩展读取后返回

</td></tr>
</tbody></table>

## Returns

Promise&lt;void&gt;

## Remarks

headless / 无头环境下 `init()` 可能返回 `undefined`<!-- -->（不可用）； 可用性判定用 `init() === undefined`<!-- -->，3D 光追相关流程不要假定一定可用 ADD since EDA v4.1.79

### pauserender

# PCB\_RayTracerEngine.pauseRender() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

暂停光线追踪渲染

## Signature

```typescript
function pauseRender(): Promise<void>;
```

## Returns

Promise&lt;void&gt;

## Remarks

暂停后光线追踪引擎将停止继续渲染 ADD since EDA v4.1.79

### removesceneelement

# PCB\_RayTracerEngine.removeSceneElement() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

移除场景元素

## Signature

```typescript
function removeSceneElement(id: string): Promise<void>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

id

</td><td>

string

</td><td>

场景元素 ID

</td></tr>
</tbody></table>

## Returns

Promise&lt;void&gt;

## Remarks

ADD since EDA v4.1.79

### setrenderconfigurations

# PCB\_RayTracerEngine.setRenderConfigurations() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

Set the ray tracer render configurations

## Signature

```typescript
function setRenderConfigurations(configurations: IPCB_RayTracerRenderConfigurations): Promise<void>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

configurations

</td><td>

[IPCB\_RayTracerRenderConfigurations](../interfaces/IPCB_RayTracerRenderConfigurations.md)

</td><td>

Render configuration

</td></tr>
</tbody></table>

## Returns

Promise&lt;void&gt;

## Remarks

ADD since EDA v4.1.79

### setsceneelementtransform

# PCB\_RayTracerEngine.setSceneElementTransform() method

> This API is provided as a beta preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

修改场景元素变换参数

## Signature

```typescript
function setSceneElementTransform(
	id: string,
	transform: IPCB_RayTracerSceneElementTransform,
): Promise<void>;
```

## Parameters

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

id

</td><td>

string

</td><td>

场景元素 ID

</td></tr>
<tr><td>

transform

</td><td>

[IPCB\_RayTracerSceneElementTransform](../interfaces/IPCB_RayTracerSceneElementTransform.md)

</td><td>

变换参数

</td></tr>
</tbody></table>

## Returns

Promise&lt;void&gt;

## Remarks

ADD since EDA v4.1.79
