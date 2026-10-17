# ISYS\_HelpMethodDetail interface

Help 查询返回的方法详情

## Signature

```typescript
interface ISYS_HelpMethodDetail
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

[deprecated?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 方法废弃说明

</td></tr>
<tr><td>

[example?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 使用示例

</td></tr>
<tr><td>

[isAsync?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ 方法是否异步（返回 Promise，调用时需 `await`<!-- -->）

</td></tr>
<tr><td>

[notRecommendedFor?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

Array&lt;[ISYS\_HelpAudienceEntry](./ISYS_HelpAudienceEntry.md)<!-- -->&gt;

</td><td>

_(Optional)_ 不推荐的受众 / 场景（来自 `@notRecommendedFor`<!-- -->，可多个）

</td></tr>
<tr><td>

[params?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

Array&lt;{ name: string; type?: string; description?: string; required?: boolean; deprecated?: string; }&gt;

</td><td>

_(Optional)_ 入参列表

</td></tr>
<tr><td>

[recommendedFor?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

Array&lt;[ISYS\_HelpAudienceEntry](./ISYS_HelpAudienceEntry.md)<!-- -->&gt;

</td><td>

_(Optional)_ 推荐的受众 / 场景（来自 `@recommendedFor`<!-- -->，可多个）

</td></tr>
<tr><td>

[remarks?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 方法说明

</td></tr>
<tr><td>

[returns?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

\{ type?: string; description?: string \}

</td><td>

_(Optional)_ 返回值

</td></tr>
<tr><td>

[title?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 方法标题

</td></tr>
<tr><td>

[visibility?](./ISYS_HelpMethodDetail.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 方法可见性（`public` / `beta` / `alpha`<!-- -->）

</td></tr>
</tbody></table>

---

## 方法详情

### deprecated

# ISYS\_HelpMethodDetail.deprecated property

方法废弃说明

## Signature

```typescript
deprecated?: string;
```

### example

# ISYS\_HelpMethodDetail.example property

使用示例

## Signature

```typescript
example?: string;
```

### isasync

# ISYS\_HelpMethodDetail.isAsync property

方法是否异步（返回 Promise，调用时需 `await`<!-- -->）

## Signature

```typescript
isAsync?: boolean;
```

### notrecommendedfor

# ISYS\_HelpMethodDetail.notRecommendedFor property

不推荐的受众 / 场景（来自 `@notRecommendedFor`<!-- -->，可多个）

## Signature

```typescript
notRecommendedFor?: Array<ISYS_HelpAudienceEntry>;
```

### params

# ISYS\_HelpMethodDetail.params property

入参列表

## Signature

```typescript
params?: Array<{
		name: string;
		type?: string;
		description?: string;
		required?: boolean;
		deprecated?: string;
	}>;
```

### recommendedfor

# ISYS\_HelpMethodDetail.recommendedFor property

推荐的受众 / 场景（来自 `@recommendedFor`<!-- -->，可多个）

## Signature

```typescript
recommendedFor?: Array<ISYS_HelpAudienceEntry>;
```

### remarks

# ISYS\_HelpMethodDetail.remarks property

方法说明

## Signature

```typescript
remarks?: string;
```

### returns

# ISYS\_HelpMethodDetail.returns property

返回值

## Signature

```typescript
returns?: { type?: string; description?: string };
```

### title

# ISYS\_HelpMethodDetail.title property

方法标题

## Signature

```typescript
title?: string;
```

### visibility

# ISYS\_HelpMethodDetail.visibility property

方法可见性（`public` / `beta` / `alpha`<!-- -->）

## Signature

```typescript
visibility?: string;
```
