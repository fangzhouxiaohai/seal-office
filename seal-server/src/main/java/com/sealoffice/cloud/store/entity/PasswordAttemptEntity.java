package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 密码尝试计数：按 15 分钟窗口限流，key 为 HMAC 混淆后的限流键。
 * 真实主键是 (key, window) 组合，这里仅为 MyBatis-Plus 映射占位。
 */
@Data
@TableName("password_attempts")
public class PasswordAttemptEntity {

    /** key、window 是 MySQL 保留字，映射列名必须带反引号，否则通用 Mapper 生成的 SQL 会语法错误 */
    @TableId(value = "`key`", type = IdType.INPUT)
    private String key;

    @TableField("`window`")
    private Long window;

    private Integer count;
}
