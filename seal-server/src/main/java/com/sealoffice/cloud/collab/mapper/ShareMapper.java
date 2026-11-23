package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.ShareEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * shares 表访问：语句与 Node collaboration.cjs 逐条对应。
 */
public interface ShareMapper {

    @Select("SELECT * FROM shares WHERE id = #{id}")
    ShareEntity findById(@Param("id") String id);

    @Select("SELECT * FROM shares WHERE owner_id = #{userId} OR recipient_id = #{userId} ORDER BY created DESC")
    List<ShareEntity> listFor(@Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM shares WHERE owner_id = #{ownerId}")
    long countByOwner(@Param("ownerId") String ownerId);

    @Insert("INSERT INTO shares(id,node_id,owner_id,recipient_id,permission,access_hash,envelope,expires,created)"
            + " VALUES(#{id},#{nodeId},#{ownerId},#{recipientId},#{permission},#{accessHash},#{envelope},#{expires},#{created})")
    int insert(ShareEntity share);

    @Update("UPDATE shares SET revoked = 1 WHERE id = #{id}")
    int revoke(@Param("id") String id);
}
