package com.sealoffice.cloud.store.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.sealoffice.cloud.store.entity.UserEntity;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * users 表访问；自定义写操作与 Node index.cjs 的 UPDATE 语句逐条对应。
 */
public interface UserMapper extends BaseMapper<UserEntity> {

    @Select("SELECT * FROM users WHERE phone = #{phone}")
    UserEntity findByPhone(@Param("phone") String phone);

    @Update("UPDATE users SET enabled = 1, autosave = 0, envelope = #{envelope}, consent = #{consent}, "
            + "vault_key = #{vaultKey}, vault_revision = #{vaultRevision} WHERE id = #{id}")
    int enableSpace(@Param("id") String id, @Param("envelope") String envelope, @Param("consent") String consent,
                    @Param("vaultKey") String vaultKey, @Param("vaultRevision") long vaultRevision);

    @Update("UPDATE users SET vault_key = #{vaultKey}, vault_revision = #{vaultRevision} WHERE id = #{id}")
    int updateVault(@Param("id") String id, @Param("vaultKey") String vaultKey, @Param("vaultRevision") long vaultRevision);

    @Update("UPDATE users SET autosave = #{autosave} WHERE id = #{id}")
    int updateAutosave(@Param("id") String id, @Param("autosave") int autosave);

    @Update("UPDATE users SET enabled = 0, autosave = 0, envelope = NULL, consent = NULL, vault_key = NULL WHERE id = #{id}")
    int disableSpace(@Param("id") String id);
}
