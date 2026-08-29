# 官方 EasyEDA Skill 知识库导航

本目录为官方 easyeda-api-skill 文档的 vendored 拷贝（含 SKILL.md 总纲、官方 README、format/ 文档格式、guide/ 教程、references/ 参考文档）。agent 通过 `eda_skill_read` 查阅：`doc` 参数填本文件内的相对路径，如 `references/classes/SCH_PrimitiveComponent.md`。

## 入口

| 文件 | 内容 |
|---|---|
| SKILL.md | 官方总纲（环境/坐标系/常见错误/示例） |
| README.official.md / README.zh-Hans.official.md | 官方说明（英文/中文） |
| guide/ | 教程（使用扩展/如何开始/市场/国际化等） |
| user-guide/ | 用户指南 |
| format/ | 官方文档格式（schematic/pcb/project 各字段） |

## 按任务快速定位

| 任务 | 推荐文档 |
|---|---|
| 画原理图导线/元件 | references/classes/SCH_PrimitiveWire.md、SCH_PrimitiveComponent.md、SCH_Document.md |
| 网络标志/端口 | SCH_PrimitiveComponent.md（createNetFlag/createNetPort） |
| DRC | SCH_Drc.md、PCB_Drc.md |
| 网表/BOM | SCH_ManufactureData.md、SCH_Netlist.md、PCB_ManufactureData.md |
| PCB 元件/过孔/走线 | PCB_PrimitiveComponent.md、PCB_PrimitiveVia.md、PCB_PrimitiveLine.md、PCB_Document.md |
| 工程/文档管理 | DMT_Project.md、DMT_EditorControl.md、DMT_Schematic.md、DMT_Pcb.md |
| 搜索器件 | LIB_Device.md、LIB_LibrariesList.md |
| 画板截图 | DMT_EditorControl.md（getCurrentRenderedAreaImage） |
| 文档导出/本地文件 | SYS_FileManager.md、SYS_FileSystem.md |

## references/classes 类索引（127 个）

### SCH_*（21 个）

- SCH_Document
- SCH_Drc
- SCH_Event
- SCH_ManufactureData
- SCH_Net
- SCH_Netlist
- SCH_Primitive
- SCH_PrimitiveArc
- SCH_PrimitiveAttribute
- SCH_PrimitiveBus
- SCH_PrimitiveCircle
- SCH_PrimitiveComponent
- SCH_PrimitiveObject
- SCH_PrimitivePin
- SCH_PrimitivePolygon
- SCH_PrimitiveRectangle
- SCH_PrimitiveText
- SCH_PrimitiveWire
- SCH_SelectControl
- SCH_SimulationEngine
- SCH_Utils

### PCB_*（25 个）

- PCB_Document
- PCB_Drc
- PCB_Event
- PCB_Layer
- PCB_ManufactureData
- PCB_MathPolygon
- PCB_Net
- PCB_Primitive
- PCB_PrimitiveArc
- PCB_PrimitiveAttribute
- PCB_PrimitiveComponent
- PCB_PrimitiveDimension
- PCB_PrimitiveFill
- PCB_PrimitiveImage
- PCB_PrimitiveLine
- PCB_PrimitiveObject
- PCB_PrimitivePad
- PCB_PrimitivePolyline
- PCB_PrimitivePour
- PCB_PrimitivePoured
- PCB_PrimitiveRegion
- PCB_PrimitiveString
- PCB_PrimitiveVia
- PCB_RayTracerEngine
- PCB_SelectControl

### IPCB_*/ISCH_*（31 个）

- IPCB_ComplexPolygon
- IPCB_Polygon
- IPCB_PrimitiveArc
- IPCB_PrimitiveAttribute
- IPCB_PrimitiveComponent
- IPCB_PrimitiveComponentPad
- IPCB_PrimitiveDimension
- IPCB_PrimitiveFill
- IPCB_PrimitiveImage
- IPCB_PrimitiveLine
- IPCB_PrimitiveObject
- IPCB_PrimitivePad
- IPCB_PrimitivePolyline
- IPCB_PrimitivePour
- IPCB_PrimitivePoured
- IPCB_PrimitiveRegion
- IPCB_PrimitiveString
- IPCB_PrimitiveVia
- ISCH_PrimitiveArc
- ISCH_PrimitiveAttribute
- ISCH_PrimitiveBus
- ISCH_PrimitiveCbbSymbolComponent
- ISCH_PrimitiveCircle
- ISCH_PrimitiveComponent
- ISCH_PrimitiveComponentPin
- ISCH_PrimitiveObject
- ISCH_PrimitivePin
- ISCH_PrimitivePolygon
- ISCH_PrimitiveRectangle
- ISCH_PrimitiveText
- ISCH_PrimitiveWire

### DMT_*（11 个）

- DMT_Board
- DMT_EditorControl
- DMT_Event
- DMT_Folder
- DMT_Panel
- DMT_Pcb
- DMT_Project
- DMT_Schematic
- DMT_SelectControl
- DMT_Team
- DMT_Workspace

### LIB_*（10 个）

- LIB_3DModel
- LIB_Cbb
- LIB_Classification
- LIB_Device
- LIB_Footprint
- LIB_LibrariesList
- LIB_PanelLibrary
- LIB_SelectControl
- LIB_SimulationModel
- LIB_Symbol

### SYS_*（27 个）

- SYS_ClientUrl
- SYS_Dialog
- SYS_Environment
- SYS_FileManager
- SYS_FileSystem
- SYS_FontManager
- SYS_FormatConversion
- SYS_HeaderMenu
- SYS_I18n
- SYS_IFrame
- SYS_LoadingAndProgressBar
- SYS_Log
- SYS_Math
- SYS_Message
- SYS_MessageBox
- SYS_MessageBus
- SYS_PanelControl
- SYS_RightClickMenu
- SYS_Setting
- SYS_ShortcutKey
- SYS_Storage
- SYS_Timer
- SYS_ToastMessage
- SYS_Tool
- SYS_Unit
- SYS_WebSocket
- SYS_Window

### PNL_*（1 个）

- PNL_Document

### EDA（1 个）

- EDA

## 其它参考

### references/enums
> EDMT_EditorDocumentType、EDMT_EditorSplitScreenDirection、EDMT_EditorTabEventType、EDMT_IndicatorMarkerType、EDMT_ItemType、EDMT_ProjectCollaborationMode、ELIB_DeviceJlcLibraryCategory、ELIB_LibraryType、ELIB_PreviewType、ELIB_SimulationModelType、ELIB_SymbolType、EPCB_AutoRoutingCornerStyle、EPCB_AutoRoutingExistingPrimitiveMode、EPCB_AutoRoutingOptimization、EPCB_DocumentCanvasUpdateCalculationActiveStatus、EPCB_DocumentRatlineCalculatingActiveStatus、EPCB_InactiveLayerDisplayMode、EPCB_LayerColorConfiguration、EPCB_LayerId、EPCB_LayerStatus、EPCB_LayerType、EPCB_MouseEventType、EPCB_NetEventType、EPCB_PcbPlateType、EPCB_PdfOutputMethod、EPCB_PrimitiveArcInteractiveMode、EPCB_PrimitiveDimensionType、EPCB_PrimitiveEventType、EPCB_PrimitiveFillMode、EPCB_PrimitivePadHeatWeldingConnectionMethod、EPCB_PrimitivePadHoleType、EPCB_PrimitivePadShapeType、EPCB_PrimitivePadType、EPCB_PrimitivePourFillMethod、EPCB_PrimitiveRegionRuleType、EPCB_PrimitiveStringAlignMode、EPCB_PrimitiveType、EPCB_PrimitiveViaType、ESCH_DynamicSimulationEnginePullEventType、ESCH_DynamicSimulationEnginePushEventType、ESCH_ExportDocumentFileType、ESCH_MouseEventType、ESCH_PrimitiveComponentType、ESCH_PrimitiveEventType、ESCH_PrimitiveFillStyle、ESCH_PrimitiveLineType、ESCH_PrimitivePinShape、ESCH_PrimitivePinType、ESCH_PrimitiveTextAlignMode、ESCH_PrimitiveType、ESCH_SimulationNetlistType、ESCH_SpiceSimulationEnginePullEventType、ESCH_SpiceSimulationEnginePushEventType、ESYS_BottomPanelTab、ESYS_HeaderMenuEnvironment、ESYS_ImportProjectBoardOutlineSource、ESYS_ImportProjectImportOption、ESYS_ImportProjectSchematicObjectStyle、ESYS_ImportProjectViaSolderMaskExpansion、ESYS_LeftPanelTab、ESYS_LogType、ESYS_NetlistType、ESYS_RightPanelTab、ESYS_ShortcutKeyEffectiveEditorRange、ESYS_ShortcutKeyEffectiveEditorScene、ESYS_StartPageQuickStartItem、ESYS_Theme、ESYS_ToastMessageType、ESYS_Unit、ESYS_WindowEventType、ESYS_WindowOpenTarget、NetportDeviceName、SchToolBarDeviceName

### references/types
> ISYS_LanguageKeyValuePairs、TPCB_LayerTypesOfInnerLayer、TPCB_LayersInTheSelectable、TPCB_LayersOfComponent、TPCB_LayersOfCopper、TPCB_LayersOfCustom、TPCB_LayersOfDimension、TPCB_LayersOfFill、TPCB_LayersOfImage、TPCB_LayersOfInner、TPCB_LayersOfLine、TPCB_LayersOfObject、TPCB_LayersOfPad、TPCB_LayersOfRegion、TPCB_NumberOfCopperLayers、TPCB_PolygonSourceArray、TPCB_PrimitiveDimensionCoordinateSet、TPCB_PrimitivePadHole、TPCB_PrimitivePadShape、TPCB_PrimitiveSpecialPadShape、TSYS_MathPolygonGroup、TSYS_MathPolygonInput、TSYS_PcbComparisonErrorCode、TSYS_ShortcutKeys

### references/interfaces
> BoardProps、ButtonProps、CheckBoxProps、ComponentPropsMap、DialogProps、FlexItemProps、FlexProps、GridItemProps、GridProps、IDMT_BoardItem、IDMT_BriefProjectItem、IDMT_EditorDocumentItem、IDMT_EditorSplitScreenItem、IDMT_EditorTabItem、IDMT_FolderItem、IDMT_IndicatorMarkerShape、IDMT_PanelItem、IDMT_PcbItem、IDMT_ProjectItem、IDMT_SchematicItem、IDMT_SchematicPageItem、IDMT_TeamItem、IDMT_WorkspaceItem、IDesignPortal、ILIB_3DModelItem、ILIB_3DModelSearchItem、ILIB_CbbItem、ILIB_CbbSearchItem、ILIB_ClassificationIndex、ILIB_DeviceAssociationItem、ILIB_DeviceExtendPropertyItem、ILIB_DeviceItem、ILIB_DevicePropertiesForSearch、ILIB_DeviceSearchItem、ILIB_ExtendLibrary3DModelFunctions、ILIB_ExtendLibraryCbbFunctions、ILIB_ExtendLibraryClassificationIndex、ILIB_ExtendLibraryDeviceFunctions、ILIB_ExtendLibraryFootprintFunctions、ILIB_ExtendLibraryFunctions、ILIB_ExtendLibraryItem、ILIB_ExtendLibraryItemIndex、ILIB_ExtendLibrarySearchProperty、ILIB_ExtendLibrarySearchResult、ILIB_ExtendLibrarySearchResultDataLine、ILIB_ExtendLibrarySymbolFunctions、ILIB_ExtendLibraryUserIndex、ILIB_FootprintItem、ILIB_FootprintPropertiesForSearch、ILIB_FootprintSearchItem、ILIB_LibraryInfo、ILIB_LibraryItem、ILIB_PanelLibraryItem、ILIB_PanelLibrarySearchItem、ILIB_SimulationModelItem、ILIB_SimulationModelSearchItem、ILIB_SymbolItem、ILIB_SymbolPropertiesForSearch、ILIB_SymbolSearchItem、IPCB_AutoLayoutResult、IPCB_AutoRoutingProps、IPCB_AutoRoutingResult、IPCB_BomPropertiesTableColumns、IPCB_DifferentialPairItem、IPCB_DiscretizeOptions、IPCB_DiscretizedPoint、IPCB_EqualLengthNetGroupItem、IPCB_LayerItem、IPCB_NetClassItem、IPCB_NetInfo、IPCB_PadPairGroupItem、IPCB_PadPairMinWireLengthItem、IPCB_PhysicalStackingConfiguration、IPCB_Primitive、IPCB_PrimitiveAPI、IPCB_PrimitivePadHeatWelding、IPCB_PrimitivePouredPourFill、IPCB_PrimitiveSolderMaskAndPasteMaskExpansion、IPCB_SubstratePhysicalProperties、IRawNet、IRawPureSchematic、IRawSchematic、IRawWire、ISCH_DrcError、ISCH_DrcErrorPrimitive、ISCH_ExportPngResolution、ISCH_NetInfo、ISCH_Primitive、ISCH_PrimitiveAPI、ISCH_ProjectNetInfo、ISCH_WireInfo、ISYS_FileSystemFileList、ISYS_HeaderMenuSub1MenuItem、ISYS_HeaderMenuSub2MenuItem、ISYS_HeaderMenuTopMenuItem、ISYS_HeaderMenus、ISYS_LogLine、ISYS_MathBBox、ISYS_MathPoint、ISYS_MathPolygonWithHoles、ISYS_MessageBusTask、ISYS_MultilingualLanguagesData、ISYS_PcbComparisonResponse、ISYS_RightClickMenuItem、ISYS_ShortcutKeyData、ISYS_ShortcutKeyDataWithCallFn、ISYS_ShortcutKeyDataWithUserDefinedShortcutKey、ISYS_WindowEventListenerRemovableObject、IconProps、ImageProps、InputProps、ListChildren、ListProps、ModalProps、RadioGroupProps、RadioItem、ScrollerProps、SelectListItem、SelectProps、SlotProps、StyleProps、TextAreaProps、TextProps

> 查阅方式：`eda_skill_read { "doc": "references/classes/SCH_PrimitiveComponent.md" }`
