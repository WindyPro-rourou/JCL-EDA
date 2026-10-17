# ISYS\_JobStatus interface

作业状态详情

## Signature

```typescript
interface ISYS_JobStatus
```

## Remarks

含进度、结构化错误与中间结果是否已提交的信息，无需靠超时猜测状态

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

[error?](./ISYS_JobStatus.md)

</td><td>

</td><td>

\{ code: string; message: string; \}

</td><td>

_(Optional)_ 结构化错误信息（作业失败时携带）

</td></tr>
<tr><td>

[jobId](./ISYS_JobStatus.md)

</td><td>

</td><td>

string

</td><td>

作业 ID

</td></tr>
<tr><td>

[partial?](./ISYS_JobStatus.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 中间结果是否已提交（如自动布线超时 / 失败后中间几何是否已落盘）

</td></tr>
<tr><td>

[progress](./ISYS_JobStatus.md)

</td><td>

</td><td>

number

</td><td>

进度（`0` - `100`<!-- -->，整数百分比）

</td></tr>
<tr><td>

[state](./ISYS_JobStatus.md)

</td><td>

</td><td>

[ESYS\_JobState](../enums/ESYS_JobState.md)

</td><td>

作业状态

</td></tr>
</tbody></table>

---

## 属性详情

### error

# ISYS\_JobStatus.error property

结构化错误信息（作业失败时携带）

## Signature

```typescript
error?: {
		code: string;
		message: string;
	};
```

### jobid

# ISYS\_JobStatus.jobId property

作业 ID

## Signature

```typescript
jobId: string;
```

### partial

# ISYS\_JobStatus.partial property

中间结果是否已提交（如自动布线超时 / 失败后中间几何是否已落盘）

## Signature

```typescript
partial?: boolean;
```

### progress

# ISYS\_JobStatus.progress property

进度（`0` - `100`<!-- -->，整数百分比）

## Signature

```typescript
progress: number;
```

### state

# ISYS\_JobStatus.state property

作业状态

## Signature

```typescript
state: ESYS_JobState;
```
