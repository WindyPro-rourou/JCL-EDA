# ILIB\_RegisterExtendLibraryProps interface

注册外部库的附加配置

## Signature

```typescript
interface ILIB_RegisterExtendLibraryProps
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

[saveAs?](./ILIB_RegisterExtendLibraryProps.md)

</td><td>

</td><td>

\{ device?: boolean; symbol?: boolean; footprint?: boolean; cbb?: boolean; model3d?: boolean; \}

</td><td>

_(Optional)_ 各资源类型是否允许另存为

</td></tr>
</tbody></table>

---

## 属性详情

### saveas

# ILIB\_RegisterExtendLibraryProps.saveAs property

各资源类型是否允许另存为

## Signature

```typescript
saveAs?: {
		device?: boolean;
		symbol?: boolean;
		footprint?: boolean;
		cbb?: boolean;
		model3d?: boolean;
	};
```

## Remarks

缺省视为允许，显式传 `false` 的项将禁止该类型资源被另存为（本地/云端均生效）
