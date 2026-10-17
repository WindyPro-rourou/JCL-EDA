# ISYS\_JobLogEntry interface

作业日志条目

## Signature

```typescript
interface ISYS_JobLogEntry
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

[at](./ISYS_JobLogEntry.md)

</td><td>

</td><td>

number

</td><td>

日志产生时间（毫秒时间戳）

</td></tr>
<tr><td>

[code?](./ISYS_JobLogEntry.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 错误码（仅 `level` 为 `error` 时可能携带）

</td></tr>
<tr><td>

[level](./ISYS_JobLogEntry.md)

</td><td>

</td><td>

string

</td><td>

日志级别（`info` / `warn` / `error`<!-- -->）

</td></tr>
<tr><td>

[message](./ISYS_JobLogEntry.md)

</td><td>

</td><td>

string

</td><td>

日志内容

</td></tr>
</tbody></table>

---

## 属性详情

### at

# ISYS\_JobLogEntry.at property

日志产生时间（毫秒时间戳）

## Signature

```typescript
at: number;
```

### code

# ISYS\_JobLogEntry.code property

错误码（仅 `level` 为 `error` 时可能携带）

## Signature

```typescript
code?: string;
```

### level

# ISYS\_JobLogEntry.level property

日志级别（`info` / `warn` / `error`<!-- -->）

## Signature

```typescript
level: string;
```

### message

# ISYS\_JobLogEntry.message property

日志内容

## Signature

```typescript
message: string;
```
