# ESYS\_JobState enum

作业状态

## Signature

```typescript
enum ESYS_JobState
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

CANCELED

</td><td>

`'canceled'`

</td><td>

已取消

</td></tr>
<tr><td>

COMPLETED

</td><td>

`'completed'`

</td><td>

已完成

</td></tr>
<tr><td>

FAILED

</td><td>

`'failed'`

</td><td>

执行失败

</td></tr>
<tr><td>

QUEUED

</td><td>

`'queued'`

</td><td>

排队等待执行

</td></tr>
<tr><td>

RUNNING

</td><td>

`'running'`

</td><td>

执行中

</td></tr>
</tbody></table>

## Remarks

自动布线 / 自动布局等长任务作业的运行阶段，可轮询查询