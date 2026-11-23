package com.sealoffice.cloud.collab.mapper;

import com.sealoffice.cloud.collab.entity.ShareLinkEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * share_links 表访问：语句与 Node shareLinks.cjs 逐条对应。
 */
public interface ShareLinkMapper {

    @Select("SELECT * FROM share_links WHERE id = #{id}")
    ShareLinkEntity findById(@Param("id") String id);

    @Select("SELECT * FROM share_links WHERE user_id = #{userId} ORDER BY created DESC LIMIT 500")
    List<ShareLinkEntity> listFor(@Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM share_links WHERE user_id = #{userId} AND revoked = 0")
    long countActive(@Param("userId") String userId);

    @Insert("INSERT INTO share_links(id,user_id,node_id,access_hash,code_salt,code_digest,expires,created)"
            + " VALUES(#{id},#{userId},#{nodeId},#{accessHash},#{codeSalt},#{codeDigest},#{expires},#{created})")
    int insert(ShareLinkEntity link);

    @Update("UPDATE share_links SET revoked = 1 WHERE id = #{id}")
    int revoke(@Param("id") String id);

    @Update("UPDATE share_links SET downloads = downloads + 1 WHERE id = #{id}")
    int incrementDownloads(@Param("id") String id);
}
