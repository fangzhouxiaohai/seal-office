package com.sealoffice.cloud.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 短信发送流水：用于同号 60 秒间隔、同号日 20 次、同 IP 时 50 次限流。
 * id 列为 MySQL 版新增自增主键（Node SQLite 版无主键），不影响接口行为。
 */
@Data
@TableName("sends")
public class SendEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String phone;

    private String ip;

    private Long time;
}
