# data-visibility Specification

## Purpose

定义用户能看到哪些内容。这是所有出口（Web、API、MCP、RSS 输出、检索）共用的唯一数据范围规则。

## Requirements

### Requirement: 用户可见 feed 集合

用户可见的 feed 集合 SHALL 等于"个人订阅"与"已关注且仍对其可见的 Collection 中的 feed"的并集；所有读取条目的出口 MUST 只返回这个集合内的内容。

#### Scenario: 他人的订阅

- **WHEN** 用户 A 订阅了某个源而用户 B 没有
- **THEN** B 在任何出口都看不到该源的条目，直接访问条目也返回不存在

### Requirement: Collection 可见性

Collection SHALL 支持三种可见性：公开（所有人）、部门内（该部门及其下级部门成员）、私有（仅创建者）。关注后可见性收紧时，失去权限的关注者 MUST 随即看不到其中的内容。

#### Scenario: 下级部门成员

- **WHEN** 一个部门可见的 Collection 归属"研发"部门，用户属于"研发"的下级部门"前端"
- **THEN** 该用户关注后可以看到其中的 feed

#### Scenario: 平级部门成员

- **WHEN** 同一个 Collection 被"市场"部门的用户关注
- **THEN** 该用户看不到其中的 feed

#### Scenario: 可见性收紧

- **WHEN** Collection 从公开改为私有
- **THEN** 除创建者外的关注者不再能看到其中的 feed
