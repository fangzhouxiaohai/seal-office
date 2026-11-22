package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 用户主表：enabled=0 表示未开通或已停用云空间；
 * vault_key/vault_revision 为服务器封装的空间根密钥信封与版本（spaceKeys.cjs）。
 */
@Data
@TableName("users")
public class UserEntity {

    @TableId(type = IdType.INPUT)
    private String id;

    private String phone;

    private Integer enabled;

    private Integer autosave;

    /** 旧版客户端保存的根密钥信封（新版托管模式为 null） */
    private String envelope;

    /** 协议同意记录：{"version":"...","time":...} */
    private String consent;

    /** 服务器封装后的空间根密钥信封（base64：nonce|tag|密文） */
    private String vaultKey;

    private Long vaultRevision;

    private Long created;
}
