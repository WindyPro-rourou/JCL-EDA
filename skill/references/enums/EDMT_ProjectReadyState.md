# EDMT\_ProjectReadyState enum

工程就绪状态

## Signature

```typescript
enum EDMT_ProjectReadyState
```

## Enumeration Members

<table><thead><tr><th>

Member

</th><th>

Value

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

FAILED

</td><td>

`'failed'`

</td><td>

加载失败

</td></tr>
<tr><td>

LOADING

</td><td>

`'loading'`

</td><td>

加载中

</td></tr>
<tr><td>

NOT\_LOADED

</td><td>

`'notLoaded'`

</td><td>

未加载

</td></tr>
<tr><td>

READY

</td><td>

`'ready'`

</td><td>

就绪

</td></tr>
</tbody></table>

## Remarks

工程数据加载 / 初始化的阶段，读写工程前可据此确认工程已就绪，避免误判「工程为空」或触发永久挂起