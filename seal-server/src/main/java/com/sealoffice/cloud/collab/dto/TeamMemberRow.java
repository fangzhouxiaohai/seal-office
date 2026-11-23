package com.sealoffice.cloud.collab.dto;

/**
 * teamFor 授权查询的结果行：团队基本信息叠加当前成员的 role 与 envelope。
 */
public record TeamMemberRow(String id, String ownerId, String meta, Long created, String role, String envelope) {
}
