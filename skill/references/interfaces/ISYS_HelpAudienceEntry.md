# ISYS\_HelpAudienceEntry interface

受众推荐条目（对应 `@recommendedFor` / `@notRecommendedFor` 标签）

## Signature

```typescript
interface ISYS_HelpAudienceEntry
```

## Remarks

如 `@recommendedFor cli - 需 force=true` 解析为 `{ role: 'cli', note: '需 force=true' }`

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

[note?](./ISYS_HelpAudienceEntry.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ 推荐 / 不推荐的补充说明

</td></tr>
<tr><td>

[role](./ISYS_HelpAudienceEntry.md)

</td><td>

</td><td>

string

</td><td>

受众 / 场景标识（如 `cli`<!-- -->、`human`<!-- -->、`plugin`<!-- -->）

</td></tr>
</tbody></table>

---

## 属性详情

### note

# ISYS\_HelpAudienceEntry.note property

推荐 / 不推荐的补充说明

## Signature

```typescript
note?: string;
```

### role

# ISYS\_HelpAudienceEntry.role property

受众 / 场景标识（如 `cli`<!-- -->、`human`<!-- -->、`plugin`<!-- -->）

## Signature

```typescript
role: string;
```
